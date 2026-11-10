
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const validateOnly = args.includes('--validate');
const apply = args.includes('--apply');

const approvedSignatures = [
  'Dark Chocolate Ganache Tart',
  'Salted Caramel Macadamia Tart',
  'Uji Matcha Mousse Cake',
  'Strawberry Chiffon Shortcake'
];

const optionBuckets = {
  size: 'sizes',
  flavor: 'flavors',
  cream: 'creams',
  font: 'fonts',
  color: 'textColors'
};

const customCategoryId = 'FINAL_V2_CUSTOM_CAKE';

const readJson = async file =>
  JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));

const nonDemoText = value =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !/\b(TEST|DEMO)\b/i.test(value);

const approved = row =>
  nonDemoText(row?.approvalReference) &&
  nonDemoText(row?.approvedBy) &&
  Number.isFinite(Date.parse(row?.approvedAt));

const vnd = value =>
  Number.isSafeInteger(value) && value >= 0;

function unique(rows, key, label) {
  assert.equal(
    new Set(rows.map(key)).size,
    rows.length,
    `Trùng ID: ${label}`
  );
}

async function loadApprovedCatalog() {
  const [products, categories, cake, catalog, customization] =
    await Promise.all([
      readJson('site/data/products.json'),
      readJson('site/data/categories.json'),
      readJson('site/data/cake-options.json'),
      readJson('reference/production/catalog-approval.json'),
      readJson('reference/production/customization-approval.json')
    ]);

  assert.equal(catalog.environment, 'production');
  assert.equal(customization.environment, 'production');
  assert.ok(
    approved(catalog) && approved(customization),
    'Thiếu phê duyệt production'
  );

  assert.equal(products.length, 65);
  assert.equal(categories.length, 7);
  assert.equal(catalog.sourceInventory?.productCount, 65);
  assert.equal(catalog.sourceInventory?.categoryCount, 7);
  assert.equal(catalog.products.length, 63);
  assert.equal(catalog.categories.length, 8);
  assert.equal(catalog.excludedSourceProducts.length, 2);
  assert.equal(customization.options.length, 16);
  assert.equal(
    customization.compatibilityPolicy,
    'ALL_COMBINATIONS_APPROVED'
  );

  unique(products, x => x.id, 'source products');
  unique(categories, x => x.id, 'source categories');
  unique(catalog.products, x => x.sourceId, 'approved products');
  unique(catalog.categories, x => x.sourceId, 'approved categories');
  unique(
    customization.options,
    x => `${x.categorySourceKey}/${x.sourceKey}`,
    'approved options'
  );

  const sourceProducts = new Map(
    products.map(x => [x.id, x])
  );

  const sourceCategories = new Map(
    categories.map(x => [x.id, x])
  );

  const approvedCategories = new Map(
    catalog.categories.map(x => [x.sourceId, x])
  );

  const sourceOptions = new Map(
    Object.entries(optionBuckets).flatMap(([role, bucket]) =>
      cake[bucket].map(x => [`${role}/${x.id}`, x])
    )
  );

  assert.equal(sourceOptions.size, 16);
  assert.equal(
    approvedCategories.get(customCategoryId)?.name,
    'Bánh tùy chỉnh'
  );
  assert.equal(
    approvedCategories.get(customCategoryId)?.slug,
    'banh-tuy-chinh'
  );
  assert.equal(
    approvedCategories.get(customCategoryId)?.origin,
    'FINAL_V2'
  );

  for (const category of catalog.categories) {
    if (category.sourceId !== customCategoryId) {
      assert.equal(
        category.name,
        sourceCategories.get(category.sourceId)?.name,
        `Sai category ${category.sourceId}`
      );
    }
  }

  const excludedIds = new Set(
    catalog.excludedSourceProducts.map(x => x.sourceId)
  );

  assert.equal(excludedIds.size, 2);

  for (const row of catalog.excludedSourceProducts) {
    assert.ok(sourceProducts.has(row.sourceId));
    assert.ok(!sourceProducts.get(row.sourceId).name?.trim());
    assert.equal(row.saleStatus, 'inactive');
    assert.ok(!['APPROVED', 'ACTIVE'].includes(row.reviewState));
  }

  assert.equal(
    new Set([
      ...catalog.products.map(x => x.sourceId),
      ...excludedIds
    ]).size,
    65
  );

  for (const row of catalog.products) {
    const source = sourceProducts.get(row.sourceId);

    assert.ok(
      source && source.name?.trim(),
      `Product không có nguồn/tên: ${row.sourceId}`
    );

    assert.equal(
      row.reviewState,
      'APPROVED',
      `Chưa duyệt: ${row.sourceId}`
    );

    assert.ok(
      approved(row),
      `Thiếu approval product: ${row.sourceId}`
    );

    assert.ok(row.name?.trim(), `Thiếu tên: ${row.sourceId}`);

    assert.ok(
      row.name === source.name ||
      nonDemoText(row.verifiedNameEvidence),
      `Tên chưa xác minh: ${row.sourceId}`
    );

    assert.ok(
      approvedCategories.has(row.categorySourceId),
      `Category không tồn tại: ${row.sourceId}`
    );

    const isCustom =
      row.sourceId === cake.customProductId &&
      Boolean(source.isCustomizable);

    if (isCustom) {
      assert.equal(row.categorySourceId, customCategoryId);
    } else {
      assert.ok(
        row.categorySourceId === source.categoryId ||
        nonDemoText(row.verifiedCategoryEvidence),
        `Category chưa xác minh: ${row.sourceId}`
      );
    }

    assert.equal(
      row.customizable,
      Boolean(source.isCustomizable)
    );

    assert.ok(
      /^https:\/\//i.test(row.imageUrl || ''),
      `Ảnh thiếu HTTPS: ${row.sourceId}`
    );

    assert.equal(row.imageReachability, 'OK');

    assert.ok(
      nonDemoText(row.imageRightsEvidence),
      `Thiếu chứng cứ ảnh: ${row.sourceId}`
    );

    assert.ok(
      row.imageUrl === source.image ||
      nonDemoText(row.verifiedImageEvidence),
      `Ảnh đổi chưa xác minh: ${row.sourceId}`
    );

    assert.ok(
      vnd(row.approvedOpeningStock),
      `Tồn kho sai: ${row.sourceId}`
    );

    if (!row.customizable) {
      assert.ok(
        vnd(row.approvedPriceVnd) &&
        row.approvedPriceVnd > 0,
        `Giá sai: ${row.sourceId}`
      );
    }

    assert.equal(row.saleStatus, 'active');
  }

  assert.equal(
    catalog.products.filter(x => x.customizable).length,
    1
  );

  assert.equal(
    catalog.products.find(x => x.customizable)?.sourceId,
    cake.customProductId
  );

  for (const name of approvedSignatures) {
    assert.ok(
      catalog.products.some(
        x => x.name === name && !x.customizable
      ),
      `Thiếu signature: ${name}`
    );
  }

  for (const row of customization.options) {
    const key = `${row.categorySourceKey}/${row.sourceKey}`;
    const source = sourceOptions.get(key);

    assert.ok(source, `Không tìm thấy source option: ${key}`);
    assert.equal(row.reviewState, 'APPROVED');

    assert.ok(
      approved(row) &&
      nonDemoText(row.validCombinationEvidence),
      `Option chưa duyệt: ${key}`
    );

    assert.equal(row.name, source.name);
    assert.equal(row.saleStatus, 'active');

    assert.ok(
      vnd(row.approvedModifierVnd),
      `Modifier sai: ${key}`
    );

    if (row.categorySourceKey === 'size') {
      assert.ok(
        vnd(row.approvedBasePriceVnd) &&
        row.approvedBasePriceVnd > 0,
        `Base price sai: ${key}`
      );
    } else {
      assert.equal(row.approvedBasePriceVnd, null);
    }
  }

  return {
    catalog,
    customization,
    sourceProducts,
    sourceCategories
  };
}

function cloudConnection() {
  const projectRef =
    process.env.BOBOT_CLOUD_PROJECT_REF?.trim();

  const raw = process.env.BOBOT_CLOUD_DB_URL;

  assert.match(
    projectRef || '',
    /^[a-z0-9]{12,32}$/,
    'BOBOT_CLOUD_PROJECT_REF không hợp lệ'
  );

  assert.ok(raw, 'Thiếu BOBOT_CLOUD_DB_URL');

  const url = new URL(raw);

  assert.ok(
    ['postgres:', 'postgresql:'].includes(url.protocol)
  );

  assert.ok(
    url.hostname.endsWith('.pooler.supabase.com'),
    'Chỉ nhận Supabase Session Pooler'
  );

  assert.equal(
    url.port,
    '5432',
    'Session Pooler cần cổng 5432'
  );

  assert.equal(
    decodeURIComponent(url.username),
    `postgres.${projectRef}`,
    'Project Ref không khớp tài khoản Pooler'
  );

  assert.equal(url.pathname, '/postgres');

  assert.ok(
    url.password &&
    !url.password.includes('YOUR-PASSWORD'),
    'Thiếu database password'
  );

  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslcert');
  url.searchParams.delete('sslkey');
  url.searchParams.delete('sslrootcert');

  return {
    projectRef,
    connectionString: url.toString(),
    host: url.hostname
  };
}

async function counts(client) {
  const result = await client.query(`
    select
      (select count(*) from public.categories)::integer
        as categories,
      (select count(*) from public.products)::integer
        as products,
      (select count(*) from public.products
       where status = 'active' and base_price > 0)::integer
        as sellable_products,
      (select count(*) from public.customization_categories)::integer
        as customization_categories,
      (select count(*) from public.customization_options)::integer
        as cake_options
  `);

  return result.rows[0];
}

async function insertAudit(
  client,
  type,
  entityId,
  approvalRow,
  detail
) {
  await client.query(`
    insert into public.audit_log(
      actor_type,
      action,
      entity_type,
      entity_id,
      new_value
    )
    values (
      'system',
      'catalog_approved_cloud',
      $1,
      $2,
      $3::jsonb
    )
  `, [
    type,
    entityId,
    JSON.stringify({
      approvalReference: approvalRow.approvalReference,
      approvedBy: approvalRow.approvedBy,
      approvedAt: approvalRow.approvedAt,
      ...detail
    })
  ]);
}

async function main() {
  assert.ok(
    args.every(x => ['--validate', '--apply'].includes(x)),
    'Chỉ hỗ trợ --validate hoặc --apply'
  );

  assert.ok(
    !(validateOnly && apply),
    'Không chạy --validate và --apply cùng lúc'
  );

  const data = await loadApprovedCatalog();

  const summary = {
    targetCategories: 8,
    approvedProducts: 63,
    sellableProducts: 62,
    approvedOptions: 16,
    excludedSourceProducts: 2,
    signatureProducts: 4
  };

  if (validateOnly) {
    console.log(JSON.stringify({
      status: 'VALIDATED_NO_DB_WRITE',
      ...summary
    }, null, 2));
    return;
  }

  const target = cloudConnection();

  const client = new Client({
    connectionString: target.connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000
  });

  let transactionOpen = false;

  try {
    await client.connect();
    await client.query('begin');
    transactionOpen = true;

    await client.query(
      "set local lock_timeout = '8s'"
    );

    await client.query(
      "set local statement_timeout = '30s'"
    );

    await client.query(
      'select pg_advisory_xact_lock($1::bigint)',
      [4000066002]
    );

    const before = await counts(client);

    assert.ok(
      before.categories === 0 &&
      before.products === 0 &&
      before.customization_categories === 0 &&
      before.cake_options === 0,
      'Cloud đã có dữ liệu catalog. Script chỉ cho phép import vào catalog trống, không cập nhật hay xóa dữ liệu cũ.'
    );

    console.log(JSON.stringify({
      status: apply
        ? 'APPLYING_CLOUD'
        : 'PREVIEW_NO_DB_WRITE',
      projectRef: target.projectRef,
      poolerHost: target.host,
      before,
      plannedInserts: {
        categories: 8,
        products: 63,
        customizationCategories: 5,
        customizationOptions: 16
      },
      deletes: 0,
      ...summary
    }, null, 2));

    if (!apply) {
      await client.query('rollback');
      transactionOpen = false;
      return;
    }

    const categoryIds = new Map();

    for (const row of data.catalog.categories) {
      const slug =
        row.slug ||
        data.sourceCategories.get(row.sourceId)?.slug ||
        null;

      const result = await client.query(`
        insert into public.categories(
          source_id,
          name,
          slug,
          status
        )
        values ($1, $2, $3, 'active')
        returning id
      `, [
        row.sourceId,
        row.name,
        slug
      ]);

      categoryIds.set(
        row.sourceId,
        result.rows[0].id
      );

      await insertAudit(
        client,
        'category',
        result.rows[0].id,
        data.catalog,
        {
          sourceId: row.sourceId,
          name: row.name
        }
      );
    }

    for (const row of data.catalog.products) {
      const source =
        data.sourceProducts.get(row.sourceId);

      const result = await client.query(`
        insert into public.products(
          source_id,
          category_id,
          name,
          description,
          image_url,
          base_price,
          stock_quantity,
          status,
          is_customizable
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, 'active', $8
        )
        returning id
      `, [
        row.sourceId,
        categoryIds.get(row.categorySourceId),
        row.name,
        source.description || null,
        row.imageUrl,
        row.customizable
          ? null
          : row.approvedPriceVnd,
        row.approvedOpeningStock,
        row.customizable
      ]);

      await insertAudit(
        client,
        'product',
        result.rows[0].id,
        row,
        {
          sourceId: row.sourceId,
          priceVnd: row.customizable
            ? null
            : row.approvedPriceVnd,
          openingStock: row.approvedOpeningStock
        }
      );
    }

    const optionCategoryIds = new Map();

    for (const role of Object.keys(optionBuckets)) {
      const result = await client.query(`
        insert into public.customization_categories(
          source_key,
          name,
          pricing_role,
          status
        )
        values ($1, $1, $1, 'active')
        returning id
      `, [role]);

      optionCategoryIds.set(
        role,
        result.rows[0].id
      );
    }

    for (const row of data.customization.options) {
      const result = await client.query(`
        insert into public.customization_options(
          category_id,
          source_key,
          name,
          base_price,
          price_modifier,
          status
        )
        values (
          $1, $2, $3, $4, $5, 'active'
        )
        returning id
      `, [
        optionCategoryIds.get(row.categorySourceKey),
        row.sourceKey,
        row.name,
        row.approvedBasePriceVnd,
        row.approvedModifierVnd
      ]);

      await insertAudit(
        client,
        'customization_option',
        result.rows[0].id,
        row,
        {
          sourceKey: row.sourceKey,
          categorySourceKey: row.categorySourceKey,
          basePriceVnd: row.approvedBasePriceVnd,
          modifierVnd: row.approvedModifierVnd
        }
      );
    }

    const after = await counts(client);

    assert.deepEqual(after, {
      categories: 8,
      products: 63,
      sellable_products: 62,
      customization_categories: 5,
      cake_options: 16
    });

    const signatures = await client.query(`
      select name
      from public.products
      where name = any($1::text[])
        and status = 'active'
        and base_price > 0
    `, [approvedSignatures]);

    assert.equal(
      signatures.rows.length,
      4,
      'Cloud thiếu signature products'
    );

    await client.query('commit');
    transactionOpen = false;

    console.log(JSON.stringify({
      status: 'APPLIED_CLOUD_RECONCILED',
      projectRef: target.projectRef,
      after
    }, null, 2));

  } finally {
    if (transactionOpen) {
      await client.query('rollback').catch(() => {});
    }

    await client.end().catch(() => {});
  }
}

main().catch(error => {
  const secret = process.env.BOBOT_CLOUD_DB_URL;

  const message = String(error.message || error)
    .replaceAll(secret || '\u0000', '[REDACTED]');

  console.error('FAILED:', message);
  process.exitCode = 1;
});
