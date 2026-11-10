
const origins = (Deno.env.get('CAKE_PREVIEW_ALLOWED_ORIGINS') ||
  'http://127.0.0.1:4173,http://localhost:4173')
  .split(',')
  .map(value => value.trim());

function reply(origin, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    }
  });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';

  if (!origins.includes(origin)) {
    return new Response('Origin forbidden', {status: 403});
  }

  if (request.method === 'OPTIONS') return reply(origin, 200, {});
  if (request.method !== 'POST') {
    return reply(origin, 405, {error: 'METHOD_NOT_ALLOWED'});
  }

  const url = Deno.env.get('SUPABASE_URL');
  const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  const key = Deno.env.get('SUPABASE_ANON_KEY') || publishable.default;
  const geminiKey = Deno.env.get('GEMINI_API_KEY');

  if (!url || !key || !geminiKey) {
    return reply(origin, 503, {error: 'SERVICE_NOT_CONFIGURED'});
  }

  const authorization = request.headers.get('authorization') || '';

  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return reply(origin, 401, {error: 'AUTH_REQUIRED'});
  }

  try {
    const raw = await request.text();

    if (raw.length > 4096) {
      return reply(origin, 413, {error: 'REQUEST_TOO_LARGE'});
    }

    const choices = JSON.parse(raw);

    for (const field of ['size', 'flavor', 'cream', 'font', 'color']) {
      if (
        typeof choices[field] !== 'string' ||
        !/^[\p{L}\p{N}\s()+.\-]{1,64}$/u.test(choices[field])
      ) {
        return reply(origin, 400, {error: 'INVALID_CAKE_OPTIONS'});
      }
    }

    if (
      typeof choices.text !== 'string' ||
      choices.text.length > 30 ||
      /[\x00-\x1f]/.test(choices.text)
    ) {
      return reply(origin, 400, {error: 'INVALID_CAKE_TEXT'});
    }

    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: key,
        Authorization: authorization
      }
    });

    if (!userResponse.ok) {
      return reply(origin, 401, {error: 'AUTH_REQUIRED'});
    }

    const requestedText = choices.text?.trim();

    const prompt = [
      'Create ONE photorealistic professional French patisserie product photograph of a physically makeable custom round celebration cake.',
      'Premium Maison Bơ & Bột aesthetic, three-quarter view, elegant travertine stand, warm ivory backdrop, soft champagne studio lighting.',
      `Cake size: ${choices.size}. Sponge flavor: ${choices.flavor}. Frosting: ${choices.cream}.`,
      `The cake should include a real piped inscription written directly on the cake surface.`,
      `Inscription text: "${requestedText || ''}".`,
      `Inscription font style preference: ${choices.font}.`,
      `Inscription color preference: ${choices.color}.`,
      'Render the inscription as realistic piped frosting or cream lettering that follows the cake perspective and surface naturally.',
      'Place the inscription neatly and legibly on the top surface of the cake, centered and visually balanced.',
      'The lettering must look like it was physically decorated onto the cake by a baker, not like digital overlay text.',
      'Minimal realistic piped frosting, refined finish, natural cake proportions.',
      'No logos, no watermarks, no hands, no people, no additional cakes.',
      'Show the whole cake, sharp focus, square composition.'
    ].join(' ');

    const generated = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{parts: [{text: prompt}]}],
          generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
        }),
        signal: AbortSignal.timeout(55000)
      }
    );

    if (!generated.ok) {
      const failure = await generated.json().catch(() => null);

      console.error('Gemini API error:', {
        httpStatus: generated.status,
        code: failure?.error?.code ?? null,
        status: failure?.error?.status ?? 'UNKNOWN',
        message: String(failure?.error?.message ?? '').slice(0, 700)
      });

      const unavailable = [402, 403, 429].includes(generated.status);

      return reply(origin, unavailable ? 503 : 502, {
        error: unavailable
          ? 'GEMINI_QUOTA_OR_BILLING'
          : 'GEMINI_UNAVAILABLE'
      });
    }

    const result = await generated.json();
    const part = result.candidates?.[0]?.content?.parts
      ?.find(value => value.inlineData?.data);

    if (
      !part ||
      !/^image\/(png|jpeg|webp)$/.test(part.inlineData.mimeType) ||
      part.inlineData.data.length > 8500000
    ) {
      return reply(origin, 502, {error: 'NO_IMAGE_RETURNED'});
    }

    return reply(origin, 200, {
      image: part.inlineData.data,
      mimeType: part.inlineData.mimeType
    });
  } catch (error) {
    console.error('Cake preview failed:', String(error?.message || error));
    return reply(origin, 500, {error: 'PREVIEW_FAILED'});
  }
});
