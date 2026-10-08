#!/usr/bin/env python3
"""Performance-only responsive assets for five pages. Does not edit SEO copy or metadata."""
import base64
import re
import urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/perf'
FONTS=ROOT/'assets/fonts'
PAGES=['index.html','bathroom-renovations-fulham.html','projects.html',
       'project-lille-road-fulham.html','project-rosaline-road-fulham.html']
HOME=['homepage-bathrooms.png','homepage-ensuite-hexagon.jpg','downstairs-toilet.png',
      'ensuite-family-homes.png','homepage-planning-terrazzo.jpg','munster-road-map.png']

def protected(html):
    patterns=[r'<title\b[^>]*>.*?</title>',r'<h1\b[^>]*>.*?</h1>',
      r'<meta\b(?=[^>]*name=["\']description["\'])[^>]*>',
      r'<link\b(?=[^>]*rel=["\']canonical["\'])[^>]*>',
      r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>.*?</script>']
    return [[x.group(0) for x in re.finditer(p,html,re.I|re.S)] for p in patterns]

def attr(tag,name):
    m=re.search(r'\b'+name+r'\s*=\s*(["\'])(.*?)\1',tag,re.I|re.S)
    return m.group(2) if m else None

def set_attr(tag,name,value):
    p=r'\b'+name+r'\s*=\s*(["\']).*?\1'
    if re.search(p,tag,re.I|re.S):
        return re.sub(p,lambda _:f'{name}="{value}"',tag,count=1,flags=re.I|re.S)
    return tag[:-1]+f' {name}="{value}">'

def image(source):
    with Image.open(source) as f:
        img=ImageOps.exif_transpose(f)
        img.load()
        return img.copy()

def variant(img, rel, target, cap=None):
    width=min(target,img.width)
    new=img if width==img.width else img.resize((width,round(img.height*width/img.width)),Image.Resampling.LANCZOS)
    if new.mode not in ('RGB','RGBA'):
        new=new.convert('RGBA' if 'A' in new.getbands() else 'RGB')
    for q in (78,70,60,50,40,30):
        buf=BytesIO()
        new.save(buf,'WEBP',quality=q,method=6)
        if cap is None or buf.tell() <= cap: break
    else:
        raise RuntimeError(f'Image cannot meet size cap: {rel}')
    dst=ROOT/rel
    dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_bytes(buf.getvalue())
    print('WEBP',rel,round(buf.tell()/1024),'KiB')
    return (new.width,rel)

def hero(html):
    m=re.search(r'<img\b[^>]*src="data:image/webp;base64,([A-Za-z0-9+/=]+)"[^>]*>',html,re.I)
    if not m: raise RuntimeError('Expected embedded homepage hero missing')
    img=Image.open(BytesIO(base64.b64decode(m.group(1))))
    img.load()
    choices=[]
    for width in (480,800,1200):
        choices.append(variant(img,f'assets/perf/home-hero-{min(width,img.width)}.webp',width,150*1024))
    choices=sorted(dict(choices).items())
    tag=m.group(0)
    tag=set_attr(tag,'src',choices[-1][1])
    tag=set_attr(tag,'srcset',', '.join(f'{rel} {w}w' for w,rel in choices))
    tag=set_attr(tag,'sizes','(max-width: 700px) 100vw, (max-width:1000px) 100vw, 48vw')
    for n,v in [('width',img.width),('height',img.height),('fetchpriority','high'),('decoding','async')]:
        tag=set_attr(tag,n,str(v))
    tag=re.sub(r'\s+loading=["\']lazy["\']','',tag,flags=re.I)
    return html[:m.start()]+tag+html[m.end():]

def home_images(html):
    for src in HOME:
        img=image(ROOT/src)
        choices=[]
        for width in (400,800,1200):
            choices.append(variant(img,f'assets/perf/{Path(src).stem}-{min(width,img.width)}.webp',width))
        choices=sorted(dict(choices).items())
        def repl(m):
            t=m.group(0)
            t=set_attr(t,'src',choices[-1][1])
            t=set_attr(t,'srcset',', '.join(f'{rel} {w}w' for w,rel in choices))
            sizes='(max-width:700px) 100vw, (max-width:1000px) 50vw, 33vw' if 'card-image' in t else '(max-width:1000px) 100vw, 50vw'
            for n,v in [('sizes',sizes),('width',img.width),('height',img.height),('loading','lazy'),('decoding','async')]:
                t=set_attr(t,n,str(v))
            return t
        html,n=re.subn(r'<img\b[^>]*\bsrc="'+re.escape(src)+r'"[^>]*>',repl,html,flags=re.I)
        if n!=1: raise RuntimeError(f'Missing or repeated homepage image {src} ({n})')
    return html

def all_images(html,page):
    def repl(m):
        t=m.group(0)
        src=attr(t,'src')
        if not src or src.startswith(('data:','https:','http:')): return t
        path=ROOT/src
        if not path.is_file(): raise RuntimeError(f'{page}: image missing: {src}')
        im=image(path)
        for n,v in [('width',im.width),('height',im.height),('decoding','async')]:
            t=set_attr(t,n,str(v))
        if attr(t,'loading') is None and attr(t,'fetchpriority')!='high':
            t=set_attr(t,'loading','lazy')
        if src.endswith('.webp') and im.width>480:
            small=str(Path(src).with_name(Path(src).stem+'-360.webp'))
            if not (ROOT/small).is_file():
                variant(im,small,360)
            candidates=[(360,small)]
            old=attr(t,'srcset')
            if old:
                for rel,w in re.findall(r'([^\s,]+)\s+(\d+)w',old):
                    if not (ROOT/rel).is_file(): raise RuntimeError(f'Unknown srcset {rel}')
                    candidates.append((image(ROOT/rel).width,rel))
            else:
                sm=str(Path(src).with_name(Path(src).stem+'-sm.webp'))
                if (ROOT/sm).is_file(): candidates.append((image(ROOT/sm).width,sm))
            candidates.append((im.width,src))
            candidates=sorted(dict(candidates).items())
            t=set_attr(t,'srcset',', '.join(f'{rel} {w}w' for w,rel in candidates))
            if attr(t,'sizes') is None:
                t=set_attr(t,'sizes','(max-width:700px) 100vw, (max-width:1000px) 50vw, 380px')
        return t
    return re.sub(r'<img\b[^>]*>',repl,html,flags=re.I)

def fonts():
    FONTS.mkdir(parents=True,exist_ok=True)
    url='https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Playfair+Display:wght@300..700&display=swap'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'})
    css=urllib.request.urlopen(req,timeout=40).read().decode()
    rules=[]
    for family,name in [('Inter','inter'),('Playfair Display','playfair-display')]:
        face=[]
        for block in re.findall(r'@font-face\s*\{[^}]+\}',css,re.S):
            if f"font-family: '{family}'" not in block: continue
            m=re.search(r'url\((https://[^)]+\.woff2)\)',block)
            if m: face.append(('U+0000-00FF' in block,m.group(1)))
        if not face: raise RuntimeError(f'No WOFF2 font for {family}')
        fonturl=next((u for latin,u in face if latin),face[-1][1])
        data=urllib.request.urlopen(fonturl,timeout=45).read()
        if len(data)<1000 or len(data)>250_000: raise RuntimeError(f'Unexpected font file {family}')
        rel=f'assets/fonts/{name}-latin.woff2'
        (ROOT/rel).write_bytes(data)
        rules.append(f"@font-face{{font-family:'{family}';src:url('/{rel}') format('woff2');font-style:normal;font-weight:300 700;font-display:swap;}}")
        print('FONT',rel,len(data),'bytes')
    p=ROOT/'assets/css/site.css'
    source=p.read_text(encoding='utf-8')
    source,n=re.subn(r'@import\s+url\(["\']https://fonts\.googleapis\.com/css2[^;]+;\s*','',source,count=1)
    if n!=1: raise RuntimeError('Google Fonts @import not found in site.css')
    p.write_text('\n'.join(rules)+'\n'+source,encoding='utf-8')
    return ('/assets/fonts/inter-latin.woff2','/assets/fonts/playfair-display-latin.woff2')

def head(html,page,fontpaths):
    old='<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css">'
    if old not in html: raise RuntimeError(f'Expected Font Awesome link missing: {page}')
    replacement='<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" media="print" onload="this.media=\'all\'"><noscript>'+old+'</noscript>'
    html=html.replace(old,replacement,1)
    html=re.sub(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">','',html)
    html=re.sub(r'<link rel="preconnect" href="https://fonts\.gstatic\.com" crossorigin>','',html)
    preload=''.join(f'<link rel="preload" href="{p}" as="font" type="font/woff2" crossorigin>' for p in fontpaths)
    if page=='index.html':
        preload+='<link rel="preload" as="image" href="assets/perf/home-hero-800.webp" imagesrcset="assets/perf/home-hero-480.webp 480w, assets/perf/home-hero-800.webp 800w" imagesizes="(max-width:700px) 100vw, 48vw" fetchpriority="high">'
    if page=='bathroom-renovations-fulham.html':
        preload+='<link rel="preload" as="image" href="assets/projects/lille-road/lr-finished-1-sm.webp" imagesrcset="assets/projects/lille-road/lr-finished-1-sm.webp 700w, assets/projects/lille-road/lr-finished-1.webp 1400w" imagesizes="(max-width:900px) 100vw, 45vw" fetchpriority="high">'
    return html.replace('</head>',preload+'</head>',1)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    originals={p:(ROOT/p).read_text(encoding='utf-8') for p in PAGES}
    seo={p:protected(html) for p,html in originals.items()}
    ff=fonts()
    for p,html in originals.items():
        if p=='index.html':
            html=hero(html)
            html=home_images(html)
        html=all_images(html,p)
        html=head(html,p,ff)
        if protected(html)!=seo[p]: raise RuntimeError(f'Protected SEO markup changed: {p}')
        (ROOT/p).write_text(html,encoding='utf-8')
    print('PASS: 5 pages: titles, H1, meta descriptions, canonicals, and schema unchanged')
    print('Optimized home images:',len(list(OUT.glob('*.webp'))))

if __name__=='__main__':
    main()
