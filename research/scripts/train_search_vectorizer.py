import argparse
import json
import re
import unicodedata
from pathlib import Path

import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer


def normalize(value):
    value = unicodedata.normalize('NFD', str(value).lower().replace('đ', 'd'))
    value = ''.join(char for char in value if unicodedata.category(char) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9\s]', ' ', value)).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('corpus')
    parser.add_argument('output')
    args = parser.parse_args()
    corpus = json.loads(Path(args.corpus).read_text(encoding='utf-8'))
    products = corpus['products']
    if len(products) != 63 or len({row['source_id'] for row in products}) != 63:
        raise ValueError('Approved catalog must have 63 unique source IDs')
    texts = [f"{row['name']} {row['name']} {row['category']} {row['description']}" for row in products]
    word = TfidfVectorizer(analyzer='word', ngram_range=(1, 2), preprocessor=normalize, lowercase=False, token_pattern=r'(?u)\b\w+\b')
    char = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), preprocessor=normalize, lowercase=False)
    word_matrix = word.fit_transform(texts)
    char_matrix = char.fit_transform(texts)
    docs = []
    for index, row in enumerate(products):
        word_vector = word_matrix.getrow(index)
        char_vector = char_matrix.getrow(index)
        docs.append({'source_id': row['source_id'], 'word_indices': word_vector.indices.tolist(), 'word_weights': [round(float(value), 10) for value in word_vector.data], 'char_indices': char_vector.indices.tolist(), 'char_weights': [round(float(value), 10) for value in char_vector.data]})
    model = {
        'version': 'tfidf-hybrid-20261110-v1',
        'corpus_fingerprint': corpus['fingerprint'],
        'training_products': len(products),
        'sklearn_version': sklearn.__version__,
        'analyzers': {'word': [1, 2], 'char_wb': [2, 5]},
        'weights': {'word': 0.8, 'char_wb': 0.2},
        'normalization': 'lowercase, Vietnamese accent folding, punctuation to spaces, whitespace collapse',
        'word_vocabulary': word.vocabulary_,
        'word_idf': [round(float(value), 10) for value in word.idf_],
        'char_vocabulary': char.vocabulary_,
        'char_idf': [round(float(value), 10) for value in char.idf_],
        'documents': docs,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'version': model['version'], 'products': len(docs), 'word_features': len(model['word_idf']), 'char_features': len(model['char_idf']), 'sklearn_version': sklearn.__version__, 'corpus_fingerprint': corpus['fingerprint']}))


if __name__ == '__main__':
    main()
