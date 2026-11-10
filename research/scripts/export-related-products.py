import hashlib
import io
import json
from pathlib import Path

import joblib
import numpy as np

root = Path(__file__).resolve().parents[2]
model_path = root / 'research/models/bobot_recommendation_model.joblib'
mapping_path = root / 'research/input/ML_CATALOG_MAPPING_VERIFIED.json'
products_path = root / 'site/data/products.json'
output_path = root / 'supabase/functions/related-products/rankings.json'
model_bytes = model_path.read_bytes()
model_hash = hashlib.sha256(model_bytes).hexdigest()
if model_hash != '3e73d58615b74ffbc6dbc80a6e13c65666c68a2f38351bd3c1bf305fbe5c2aab':
    raise ValueError('Recommendation artifact khác file owner bàn giao đã xác minh.')
mapping_bytes = mapping_path.read_bytes()
mapping = json.loads(mapping_bytes)
site_products = {str(row['id']): row for row in json.loads(products_path.read_text(encoding='utf-8'))}
artifact = joblib.load(io.BytesIO(model_bytes))
catalog = artifact['catalog']
matrix = artifact['content_sim']
rows = mapping['products']
by_numeric = {row['synthetic_product_id']: row for row in rows}
if len(catalog) != 62 or len(set(catalog)) != 62 or set(catalog) != set(by_numeric) or matrix.shape != (62, 62):
    raise ValueError('Catalog hoặc ma trận Recommendation không khớp mapping.')
if not np.isfinite(matrix).all() or not np.allclose(matrix, matrix.T, atol=1e-6) or not np.allclose(np.diag(matrix), 0):
    raise ValueError('Ma trận content_sim không hợp lệ.')
for numeric_id in catalog:
    row = by_numeric[numeric_id]
    product = site_products.get(row['site_product_id'])
    if product is None or row['name'].strip() != artifact['product_names'][numeric_id].strip() or row['name'].strip() != product['name'].strip() or row['price_vnd'] != product['price']:
        raise ValueError(f'Mapping sản phẩm không khớp: {numeric_id}')
rankings = {}
for index, numeric_id in enumerate(catalog):
    scores = matrix[index]
    ranked = np.argsort(-scores, kind='stable')
    source_id = by_numeric[numeric_id]['site_product_id']
    rankings[source_id] = [by_numeric[catalog[int(other)]]['site_product_id'] for other in ranked if other != index and scores[other] > 0]
output_path.parent.mkdir(parents=True, exist_ok=True)
payload = {
    'method': 'content_sim',
    'source_model_sha256': model_hash,
    'mapping_sha256': hashlib.sha256(mapping_bytes).hexdigest(),
    'catalog_size': len(catalog),
    'rankings': rankings,
}
output_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('RELATED_RANKINGS_EXPORTED', len(rankings), min(map(len, rankings.values())), max(map(len, rankings.values())))
