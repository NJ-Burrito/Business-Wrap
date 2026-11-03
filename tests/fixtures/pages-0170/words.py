"""words.py <pdf>: one line per word, 'page<TAB>word' (pages from 1), for the pages-0170 test."""
import sys
import pymupdf

d = pymupdf.open(sys.argv[1])
out = []
for n, p in enumerate(d, 1):
    for w in p.get_text('words'):
        out.append(f'{n}\t{w[4]}')
sys.stdout.write('\n'.join(out))
