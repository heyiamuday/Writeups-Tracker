#!/usr/bin/env python3
# inspect_writeups.py
import json, collections, sys
P = "writeups.json"
try:
    data = json.load(open(P, encoding='utf-8'))
except Exception as e:
    print("Failed to load writeups.json:", e); sys.exit(1)

print("Total items:", len(data))
if len(data)>0:
    import pprint
    print("\nSample item (first):")
    pprint.pprint(data[0])
# tally keys
keycnt = collections.Counter()
valcnt = collections.Counter()
possible_fields = ['tags','tag','categories','category','bug_class','bug_classification','bugs','vuln','vuln_class','class','type','category_2','labels','labels_arr']
for item in data:
    for k in item.keys():
        keycnt[k]+=1
    for fname in possible_fields:
        v = item.get(fname)
        if v is None: continue
        if isinstance(v, list):
            for x in v:
                valcnt[str(x).strip()]+=1
        else:
            # split comma-separated strings
            for x in str(v).split(','):
                if x.strip():
                    valcnt[x.strip()]+=1

print("\nTop keys (sample):")
for k,n in keycnt.most_common(40):
    print(f"{n:6d}  {k}")
print("\nTop tag-like values found:")
for v,n in valcnt.most_common(80):
    print(f"{n:6d}  {v}")
