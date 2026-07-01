const { useState, useEffect, useRef, useMemo, useCallback } = React;

const APP_VER = "v1.8";
const MODEL = "claude-sonnet-4-6";

/* ============ utils ============ */
const pad = (n) => String(n).padStart(2, "0");
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const CAL_WD = ["月", "火", "水", "木", "金", "土", "日"];
function mondayOf(d) {
  const x = new Date(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0);
  return x;
}
function buildMonth(y, m) {
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}
const uid = () =>
  (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdMs = (ms) => ymd(new Date(ms));

function fmtStamp(ms) {
  const d = new Date(ms);
  const yp = d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}年`;
  return `${yp}${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayLabel(dateStr) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  const today = ymd(new Date());
  const yest = ymd(new Date(Date.now() - 86400000));
  let tag = "";
  if (dateStr === today) tag = "今日・";
  else if (dateStr === yest) tag = "昨日・";
  return `${tag}${m}月${dd}日(${WD[d.getDay()]})`;
}

/* ============ IndexedDB ============ */
const DB_NAME = "mindlog";
const DB_VER = 1;
let _db = null;
function openDB() {
  return new Promise((res, rej) => {
    if (_db) return res(_db);
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("posts")) {
        const s = db.createObjectStore("posts", { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "id" });
      }
    };
    r.onsuccess = (e) => { _db = e.target.result; res(_db); };
    r.onerror = (e) => rej(e.target.error);
  });
}
function store(name, mode) {
  return openDB().then((db) => db.transaction(name, mode).objectStore(name));
}
function reqP(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbGetAllPosts() {
  const s = await store("posts", "readonly");
  const all = await reqP(s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
async function dbPutPost(p) { (await store("posts", "readwrite")).put(p); }
async function dbDeletePost(id) { (await store("posts", "readwrite")).delete(id); }
async function dbPutMedia(id, blob) { (await store("media", "readwrite")).put({ id, blob }); }
async function dbGetMedia(id) { return reqP((await store("media", "readonly")).get(id)); }
async function dbDeleteMedia(id) { (await store("media", "readwrite")).delete(id); }

/* media url cache */
const urlCache = new Map();
async function getMediaUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await dbGetMedia(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}
function dropMediaUrl(id) {
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
}

/* ============ icons ============ */
const ICON = {
  home: "M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  cal: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5zM4 9.5h16M8 3.5v3M16 3.5v3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  chart: "M5 20V10M12 20V4M19 20v-7",
  star: "M12 3.4l2.65 5.37 5.92.86-4.28 4.18 1.01 5.9L12 17l-5.3 2.7 1.01-5.9-4.28-4.18 5.92-.86z",
  edit: "M4 20h4L18 10l-4-4L4 16zM13.5 6.5l4 4",
  gear: "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19.4 13a7.8 7.8 0 0 0 0-2l1.8-1.4-1.8-3.1-2.2.9a7.6 7.6 0 0 0-1.7-1l-.3-2.3H9.6l-.3 2.3a7.6 7.6 0 0 0-1.7 1l-2.2-.9-1.8 3.1L5.4 11a7.8 7.8 0 0 0 0 2l-1.8 1.4 1.8 3.1 2.2-.9a7.6 7.6 0 0 0 1.7 1l.3 2.3h4.8l.3-2.3a7.6 7.6 0 0 0 1.7-1l2.2.9 1.8-3.1z",
  image: "M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M9 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
  video: "M4 6.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM16 10l5-3v10l-5-3",
  close: "M6 6l12 12M18 6 6 18",
  trash: "M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12",
  chevL: "M15 6l-6 6 6 6",
  chevR: "M9 6l6 6-6 6",
  feather: "M20 4C12 4 6 9 5 16l-1 4 4-1c7-1 12-7 12-15zM5 19l8-8M13 11h3",
  send: "M5 12l15-7-6 15-3-6-6-2z",
};
function Icon({ d, size = 22, sw = 1.7, fill = false, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style}
      fill={fill ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[d]} />
    </svg>
  );
}

/* ============ Media render ============ */
function Media({ m, onOpen, thumb, box }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    getMediaUrl(m.id).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [m.id]);
  if (!url) return <div className={box ? "attmedia ph" : "mph" + (thumb ? " th" : "")} />;
  if (box)
    return m.type === "video"
      ? <video src={url} className="attmedia" muted />
      : <img src={url} className="attmedia" alt="" />;
  if (m.type === "video")
    return <video src={url} controls playsInline preload="metadata" className="mvid" />;
  return (
    <img src={url} className={thumb ? "mimg th" : "mimg"} alt=""
      onClick={() => onOpen && onOpen(url)} />
  );
}
function MediaBlock({ media, onOpen }) {
  if (!media || !media.length) return null;
  const imgs = media.filter((m) => m.type === "image");
  const vids = media.filter((m) => m.type === "video");
  return (
    <div className="mblock">
      {imgs.length > 0 && (
        <div className={"mgrid n" + Math.min(imgs.length, 4)}>
          {imgs.map((m) => <Media key={m.id} m={m} onOpen={onOpen} thumb={imgs.length > 1} />)}
        </div>
      )}
      {vids.map((m) => <Media key={m.id} m={m} />)}
    </div>
  );
}

/* ============ attachment picker (shared) ============ */
function useAttachments() {
  const [atts, setAtts] = useState([]);
  function addFiles(list, type) {
    const arr = [...list].map((f) => ({
      key: Math.random().toString(36).slice(2), file: f, type, url: URL.createObjectURL(f),
    }));
    setAtts((a) => [...a, ...arr]);
  }
  function removeAtt(key) {
    setAtts((a) => {
      const t = a.find((x) => x.key === key);
      if (t) URL.revokeObjectURL(t.url);
      return a.filter((x) => x.key !== key);
    });
  }
  function reset() { atts.forEach((a) => URL.revokeObjectURL(a.url)); setAtts([]); }
  return { atts, addFiles, removeAtt, reset };
}
function AttRow({ existing, onRemoveExisting, atts, onRemoveAtt }) {
  if ((!existing || !existing.length) && (!atts || !atts.length)) return null;
  return (
    <div className="attrow">
      {(existing || []).map((m) => (
        <div key={m.id} className="att">
          <Media m={m} box />
          <button className="attx" onClick={() => onRemoveExisting(m)}><Icon d="close" size={13} sw={2} /></button>
        </div>
      ))}
      {(atts || []).map((a) => (
        <div key={a.key} className="att">
          {a.type === "video" ? <video src={a.url} className="attmedia" muted /> : <img src={a.url} className="attmedia" alt="" />}
          <button className="attx" onClick={() => onRemoveAtt(a.key)}><Icon d="close" size={13} sw={2} /></button>
        </div>
      ))}
    </div>
  );
}
function ToolButtons({ onImg, onVid }) {
  return (
    <div className="ctools">
      <button className="tool" onClick={onImg} aria-label="画像"><Icon d="image" size={21} /></button>
      <button className="tool" onClick={onVid} aria-label="動画"><Icon d="video" size={21} /></button>
    </div>
  );
}
function FileInputs({ imgRef, vidRef, onAdd }) {
  return (
    <>
      <input ref={imgRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { onAdd(e.target.files, "image"); e.target.value = ""; }} />
      <input ref={vidRef} type="file" accept="video/*" multiple hidden
        onChange={(e) => { onAdd(e.target.files, "video"); e.target.value = ""; }} />
    </>
  );
}

/* ============ Composer ============ */
function Composer({ onPosted }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { atts, addFiles, removeAtt, reset } = useAttachments();
  const taRef = useRef(null), imgInp = useRef(null), vidInp = useRef(null);

  function grow() {
    const ta = taRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 360) + "px"; }
  }
  async function submit() {
    const t = text.trim();
    if ((!t && atts.length === 0) || busy) return;
    setBusy(true);
    try {
      const media = [];
      for (const a of atts) {
        const id = uid();
        await dbPutMedia(id, a.file);
        media.push({ id, type: a.type, mime: a.file.type || "", name: a.file.name || "" });
      }
      const post = { id: uid(), text: t, createdAt: Date.now(), media, fav: false, editedAt: 0 };
      await dbPutPost(post);
      reset(); setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      onPosted(post);
    } finally { setBusy(false); }
  }

  return (
    <div className="composer">
      <textarea ref={taRef} className="cinput" rows={1} placeholder="いま、なにしてる？"
        value={text} onChange={(e) => { setText(e.target.value); grow(); }} />
      <AttRow atts={atts} onRemoveAtt={removeAtt} />
      <div className="cbar">
        <ToolButtons onImg={() => imgInp.current.click()} onVid={() => vidInp.current.click()} />
        <button className="post" disabled={busy || (!text.trim() && atts.length === 0)} onClick={submit}>
          <Icon d="send" size={16} sw={1.8} /> 投稿
        </button>
      </div>
      <FileInputs imgRef={imgInp} vidRef={vidInp} onAdd={addFiles} />
    </div>
  );
}

/* ============ Post editor (inline) ============ */
function PostEditor({ post, onSave, onCancel }) {
  const [text, setText] = useState(post.text);
  const [keep, setKeep] = useState(post.media || []);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const { atts, addFiles, removeAtt, reset } = useAttachments();
  const taRef = useRef(null), imgInp = useRef(null), vidInp = useRef(null);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 360) + "px"; }
  }, []);
  function grow() {
    const ta = taRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 360) + "px"; }
  }
  function removeExisting(m) {
    setKeep((k) => k.filter((x) => x.id !== m.id));
    setRemoved((r) => [...r, m.id]);
  }
  async function save() {
    const t = text.trim();
    if ((!t && keep.length === 0 && atts.length === 0) || busy) return;
    setBusy(true);
    try {
      const added = [];
      for (const a of atts) {
        const id = uid();
        await dbPutMedia(id, a.file);
        added.push({ id, type: a.type, mime: a.file.type || "", name: a.file.name || "" });
      }
      removed.forEach((id) => { dropMediaUrl(id); dbDeleteMedia(id); });
      const updated = { ...post, text: t, media: [...keep, ...added], editedAt: Date.now() };
      await dbPutPost(updated);
      reset();
      onSave(updated);
    } finally { setBusy(false); }
  }

  return (
    <div className="editbox">
      <div className="editlabel">編集中</div>
      <textarea ref={taRef} className="cinput" rows={1} value={text}
        onChange={(e) => { setText(e.target.value); grow(); }} />
      <AttRow existing={keep} onRemoveExisting={removeExisting} atts={atts} onRemoveAtt={removeAtt} />
      <div className="editbar">
        <ToolButtons onImg={() => imgInp.current.click()} onVid={() => vidInp.current.click()} />
        <div className="ebtns">
          <button className="ecancel" onClick={onCancel}>キャンセル</button>
          <button className="post" disabled={busy || (!text.trim() && keep.length === 0 && atts.length === 0)} onClick={save}>保存</button>
        </div>
      </div>
      <FileInputs imgRef={imgInp} vidRef={vidInp} onAdd={addFiles} />
    </div>
  );
}

/* ============ Post card ============ */
function PostCard({ post, onDelete, onOpen, onToggleFav, onEdit, highlight }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="card">
        <PostEditor post={post} onCancel={() => setEditing(false)}
          onSave={(u) => { setEditing(false); onEdit(u); }} />
      </div>
    );
  }

  const long = post.text.length > 280 || (post.text.match(/\n/g) || []).length > 12;
  const body = highlight ? hl(post.text, highlight) : post.text;
  return (
    <div className="card">
      <div className="cardhead">
        <span className="time">
          {fmtStamp(post.createdAt)}{post.editedAt ? <span className="edited">・編集済み</span> : null}
        </span>
        <div className="cardact">
          <button className="iconbtn" onClick={() => setEditing(true)} aria-label="編集">
            <Icon d="edit" size={16} sw={1.6} />
          </button>
          <button className={"iconbtn fav" + (post.fav ? " on" : "")} onClick={() => onToggleFav(post)} aria-label="お気に入り">
            <Icon d="star" size={16} sw={1.6} fill={!!post.fav} />
          </button>
          <button className="iconbtn del" onClick={() => onDelete(post)} aria-label="削除">
            <Icon d="trash" size={16} sw={1.6} />
          </button>
        </div>
      </div>
      {post.text && (
        <div className={"ptext" + (long && !expanded ? " clamp" : "")}>{body}</div>
      )}
      {long && (
        <button className="more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "閉じる" : "続きを読む"}
        </button>
      )}
      <MediaBlock media={post.media} onOpen={onOpen} />
    </div>
  );
}
function hl(text, q) {
  const parts = [];
  let s = text, lower = text.toLowerCase(), ql = q.toLowerCase(), idx, key = 0;
  while ((idx = lower.indexOf(ql)) >= 0) {
    if (idx > 0) parts.push(s.slice(0, idx));
    parts.push(<mark key={key++}>{s.slice(idx, idx + q.length)}</mark>);
    s = s.slice(idx + q.length);
    lower = s.toLowerCase();
  }
  if (s) parts.push(s);
  return parts;
}

/* ============ groups & views ============ */
function groupByDay(posts) {
  const g = []; let cur = null;
  for (const p of posts) {
    const day = ymdMs(p.createdAt);
    if (!cur || cur.day !== day) { cur = { day, items: [] }; g.push(cur); }
    cur.items.push(p);
  }
  return g;
}
function DayGroups({ posts, ...rest }) {
  const groups = useMemo(() => groupByDay(posts), [posts]);
  return groups.map((g) => (
    <div key={g.day} className="daygroup">
      <div className="dayhead">{dayLabel(g.day)}</div>
      {g.items.map((p) => <PostCard key={p.id} post={p} {...rest} />)}
    </div>
  ));
}
function HomeView({ posts, onPosted, ...rest }) {
  return (
    <div className="view">
      <Composer onPosted={onPosted} />
      {posts.length === 0 ? (
        <div className="empty">
          <Icon d="feather" size={40} sw={1.3} />
          <p>最初のひとことを書いてみましょう。</p>
          <span>気軽に、思ったことをそのまま。</span>
        </div>
      ) : (
        <DayGroups posts={posts} {...rest} />
      )}
    </div>
  );
}
function FavView({ posts, ...rest }) {
  const favs = useMemo(() => posts.filter((p) => p.fav), [posts]);
  return (
    <div className="view">
      {favs.length === 0 ? (
        <div className="empty">
          <Icon d="star" size={38} sw={1.3} />
          <p>お気に入りはまだありません。</p>
          <span>投稿の★マークで保存できます。</span>
        </div>
      ) : (
        <>
          <div className="rescount">{favs.length}件</div>
          <DayGroups posts={favs} {...rest} />
        </>
      )}
    </div>
  );
}
function CalendarView({ posts, ...rest }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState(ymd(new Date()));
  const byDay = useMemo(() => {
    const o = {};
    posts.forEach((p) => { const k = ymdMs(p.createdAt); (o[k] = o[k] || []).push(p); });
    return o;
  }, [posts]);

  const first = new Date(cur.y, cur.m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  function shift(delta) {
    setCur((c) => { let m = c.m + delta, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });
  }
  const selPosts = (byDay[sel] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const today = ymd(new Date());

  return (
    <div className="view">
      <div className="calhead">
        <button className="navbtn" onClick={() => shift(-1)}><Icon d="chevL" size={20} /></button>
        <div className="caltitle">{cur.y}年{cur.m + 1}月</div>
        <button className="navbtn" onClick={() => shift(1)}><Icon d="chevR" size={20} /></button>
      </div>
      <div className="calcard">
        <div className="calwk">
          {CAL_WD.map((w, i) => (
            <div key={w} className={"calwd" + (i === 5 ? " sat" : i === 6 ? " sun" : "")}>{w}</div>
          ))}
        </div>
        <div className="calgrid">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="calcell empty" />;
            const col = i % 7;
            const wk = col === 5 ? " sat" : col === 6 ? " sun" : "";
            const k = `${cur.y}-${pad(cur.m + 1)}-${pad(d)}`;
            const n = (byDay[k] || []).length;
            return (
              <button key={i} className={"calcell" + wk + (k === sel ? " sel" : "") + (k === today ? " today" : "")}
                onClick={() => setSel(k)}>
                <span className="cd">{d}</span>
                {n > 0 && <span className="cdot">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="seldate">{dayLabel(sel)} ・ {selPosts.length}件</div>
      {selPosts.length === 0
        ? <div className="emptysm">この日の記録はありません。</div>
        : selPosts.map((p) => <PostCard key={p.id} post={p} {...rest} />)}
    </div>
  );
}
function SearchView({ posts, ...rest }) {
  const [q, setQ] = useState("");
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return posts.filter((p) => p.text.toLowerCase().includes(s));
  }, [q, posts]);
  return (
    <div className="view">
      <div className="searchbar">
        <Icon d="search" size={18} style={{ color: "var(--sub)" }} />
        <input className="sinput" placeholder="投稿を検索" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="clr" onClick={() => setQ("")}><Icon d="close" size={16} sw={2} /></button>}
      </div>
      {res === null ? (
        <div className="emptysm">キーワードを入力すると、過去の投稿から探せます。</div>
      ) : res.length === 0 ? (
        <div className="emptysm">「{q}」に一致する投稿はありません。</div>
      ) : (
        <>
          <div className="rescount">{res.length}件</div>
          {res.map((p) => <PostCard key={p.id} post={p} highlight={q.trim()} {...rest} />)}
        </>
      )}
    </div>
  );
}

/* ============ Date picker (Monday start) ============ */
function DatePick({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(() => { const [y, m] = value.split("-").map(Number); return { y, m: m - 1 }; });
  function start() { const [y, m] = value.split("-").map(Number); setCur({ y, m: m - 1 }); setOpen(true); }
  function shift(delta) { setCur((c) => { let m = c.m + delta, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; }); }
  const cells = buildMonth(cur.y, cur.m);
  const today = ymd(new Date());
  return (
    <>
      <button className="dpfield" onClick={start}>{value.replace(/-/g, "/")}</button>
      {open && (
        <div className="sheetwrap dpwrap" onClick={() => setOpen(false)}>
          <div className="dpsheet" onClick={(e) => e.stopPropagation()}>
            <div className="calhead">
              <button className="navbtn" onClick={() => shift(-1)}><Icon d="chevL" size={20} /></button>
              <div className="caltitle">{cur.y}年{cur.m + 1}月</div>
              <button className="navbtn" onClick={() => shift(1)}><Icon d="chevR" size={20} /></button>
            </div>
            <div className="calcard">
              <div className="calwk">
                {CAL_WD.map((w, i) => (
                  <div key={w} className={"calwd" + (i === 5 ? " sat" : i === 6 ? " sun" : "")}>{w}</div>
                ))}
              </div>
              <div className="calgrid">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} className="calcell empty" />;
                  const col = i % 7;
                  const wk = col === 5 ? " sat" : col === 6 ? " sun" : "";
                  const k = `${cur.y}-${pad(cur.m + 1)}-${pad(d)}`;
                  return (
                    <button key={i} className={"calcell" + wk + (k === value ? " sel" : "") + (k === today ? " today" : "")}
                      onClick={() => { onChange(k); setOpen(false); }}>
                      <span className="cd">{d}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Analyze (API) ============ */
const A_KEY = "ml_analyses_v1";
function loadAnalyses() { try { return JSON.parse(localStorage.getItem(A_KEY) || "[]"); } catch { return []; } }
function saveAnalyses(a) { localStorage.setItem(A_KEY, JSON.stringify(a)); }

async function callClaude(apiKey, system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1600, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) {
    let msg = "API " + r.status;
    try { const j = await r.json(); if (j.error && j.error.message) msg += "：" + j.error.message; } catch {}
    throw new Error(msg);
  }
  const d = await r.json();
  return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function renderMd(text) {
  return text.split("\n").map((ln, i) => {
    if (/^#{1,3}\s/.test(ln)) return <h4 key={i} className="mdh">{ln.replace(/^#{1,3}\s/, "")}</h4>;
    if (/^[-・*]\s/.test(ln)) return <div key={i} className="mdli">{ln.replace(/^[-・*]\s/, "")}</div>;
    if (ln.trim() === "") return <div key={i} className="mdsp" />;
    return <p key={i} className="mdp">{ln}</p>;
  });
}

function AnalyzeView({ posts, apiKey, openSettings }) {
  const [mode, setMode] = useState("month");
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [analyses, setAnalyses] = useState(loadAnalyses);
  const [openId, setOpenId] = useState(null);

  function applyPreset(p) {
    setMode(p);
    const n = new Date();
    if (p === "week") { setFrom(ymd(mondayOf(n))); setTo(ymd(n)); }
    else if (p === "month") { setFrom(ymd(new Date(n.getFullYear(), n.getMonth(), 1))); setTo(ymd(n)); }
    else if (p === "d30") { setFrom(ymd(new Date(Date.now() - 29 * 86400000))); setTo(ymd(n)); }
    else if (p === "d90") { setFrom(ymd(new Date(Date.now() - 89 * 86400000))); setTo(ymd(n)); }
  }
  const inRange = useMemo(() => posts
    .filter((p) => { const k = ymdMs(p.createdAt); return k >= from && k <= to; })
    .filter((p) => p.text && p.text.trim())
    .sort((a, b) => a.createdAt - b.createdAt), [posts, from, to]);

  async function run() {
    setErr("");
    if (!apiKey) { openSettings(); return; }
    if (inRange.length === 0) { setErr("この期間に文章の投稿がありません。"); return; }
    setBusy(true);
    try {
      const LIMIT = 60000;
      const lines = inRange.map((p) => {
        const d = new Date(p.createdAt);
        return `[${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}] ${p.text.replace(/\n/g, " ")}`;
      });
      let joined = lines.join("\n"), truncated = false;
      if (joined.length > LIMIT) {
        truncated = true;
        const kept = []; let total = 0;
        for (let i = lines.length - 1; i >= 0; i--) { total += lines[i].length + 1; if (total > LIMIT) break; kept.unshift(lines[i]); }
        joined = kept.join("\n");
      }
      const system =
        "あなたはユーザー本人だけが読む個人的な記録を読み、その傾向を観察してまとめるアシスタントです。" +
        "指定期間の投稿から、繰り返し現れる話題、考え方や関心の動き、生活リズムや活動、変化や気づきを日本語でまとめます。" +
        "断定や決めつけ、過度な励ましは避け、観察と気づきを中心に淡々と。" +
        "見出し(##)と短い箇条書きで読みやすく、全体で600〜900字程度にしてください。";
      const user = `期間: ${from} 〜 ${to}\n投稿数: ${inRange.length}件` +
        (truncated ? "（文字数が多いため直近分のみ）" : "") + `\n\n--- 投稿 ---\n${joined}`;
      const text = await callClaude(apiKey, system, user);
      const rec = { id: uid(), createdAt: Date.now(), from, to, count: inRange.length, text };
      const next = [rec, ...analyses];
      setAnalyses(next); saveAnalyses(next); setOpenId(rec.id);
    } catch (e) { setErr(e.message || "失敗しました。"); }
    finally { setBusy(false); }
  }
  function delAnalysis(id) { const next = analyses.filter((a) => a.id !== id); setAnalyses(next); saveAnalyses(next); }

  const presets = [["week", "今週"], ["month", "今月"], ["d30", "過去30日"], ["d90", "過去90日"], ["custom", "カスタム"]];
  return (
    <div className="view">
      <div className="card pad">
        <div className="secttl">傾向をふりかえる</div>
        <div className="chips">
          {presets.map(([k, label]) => (
            <button key={k} className={"chip" + (mode === k ? " on" : "")}
              onClick={() => (k === "custom" ? setMode("custom") : applyPreset(k))}>{label}</button>
          ))}
        </div>
        <div className="daterow">
          <DatePick value={from} onChange={(v) => { setFrom(v); setMode("custom"); }} />
          <span className="tilde">〜</span>
          <DatePick value={to} onChange={(v) => { setTo(v); setMode("custom"); }} />
        </div>
        <div className="rangeinfo">対象: {inRange.length}件</div>
        {err && <div className="errbox">{err}</div>}
        <button className="runbtn" disabled={busy} onClick={run}>
          {busy ? "分析中…" : apiKey ? "この期間を分析する" : "APIキーを設定して分析"}
        </button>
        {!apiKey && (
          <div className="hint">分析にはAnthropicのAPIキーが必要です（右上の設定）。記録は端末内にのみ保存され、分析時だけ選んだ期間の本文がAPIに送られます。</div>
        )}
      </div>

      {analyses.length > 0 && <div className="secttl2">これまでの分析</div>}
      {analyses.map((a) => (
        <div key={a.id} className="card">
          <button className="anahead" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
            <div>
              <div className="anaperiod">{a.from} 〜 {a.to}</div>
              <div className="anameta">{a.count}件 ・ {new Date(a.createdAt).toLocaleDateString("ja-JP")}</div>
            </div>
            <Icon d={openId === a.id ? "chevL" : "chevR"} size={16}
              style={{ color: "var(--sub)", transform: openId === a.id ? "rotate(90deg)" : "none" }} />
          </button>
          {openId === a.id && (
            <>
              <div className="anabody">{renderMd(a.text)}</div>
              <button className="del small" onClick={() => delAnalysis(a.id)}>
                <Icon d="trash" size={14} sw={1.6} /> 削除
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============ Settings ============ */
function Settings({ onClose, posts, reload, apiKey, setApiKey }) {
  const [msg, setMsg] = useState("");
  const [k, setK] = useState(apiKey);
  const importInp = useRef(null);

  function saveKey() {
    localStorage.setItem("ml_apikey", k.trim());
    setApiKey(k.trim());
    setMsg("APIキーを保存しました。");
    setTimeout(() => setMsg(""), 2000);
  }

  function blobToB64(blob) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(blob); });
  }
  async function exportAll() {
    setMsg("書き出し中…");
    const out = { app: "mindlog", ver: 1, exportedAt: Date.now(), posts: [], media: [] };
    const ids = new Set();
    for (const p of posts) { out.posts.push(p); (p.media || []).forEach((m) => ids.add(m.id)); }
    for (const id of ids) { const rec = await dbGetMedia(id); if (rec) out.media.push({ id, type: rec.blob.type, b64: await blobToB64(rec.blob) }); }
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mindlog-backup-${ymd(new Date())}.json`; a.click();
    URL.revokeObjectURL(url); setMsg("書き出しました。");
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  }
  async function importFile(file) {
    setMsg("読み込み中…");
    try {
      const data = JSON.parse(await file.text());
      if (!data.posts) throw 0;
      for (const m of data.media || []) await dbPutMedia(m.id, b64ToBlob(m.b64, m.type || ""));
      for (const p of data.posts) await dbPutPost(p);
      setMsg(`${data.posts.length}件を読み込みました。`); await reload();
    } catch { setMsg("ファイルを読み込めませんでした。"); }
  }
  async function wipe() {
    if (!confirm("すべての投稿とメディアを削除します。元に戻せません。よろしいですか？")) return;
    if (!confirm("本当に削除しますか？")) return;
    for (const p of posts) { (p.media || []).forEach((m) => { dropMediaUrl(m.id); dbDeleteMedia(m.id); }); await dbDeletePost(p.id); }
    await reload(); setMsg("削除しました。");
  }

  return (
    <div className="sheetwrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <span>設定</span>
          <button className="navbtn" onClick={onClose}><Icon d="close" size={20} sw={2} /></button>
        </div>
        <div className="sgroup">
          <label className="slabel">Anthropic API キー</label>
          <input className="tinput" type="password" placeholder="sk-ant-..." value={k}
            onChange={(e) => setK(e.target.value)} />
          <button className="sbtn" onClick={saveKey}>保存</button>
          <p className="snote">分析機能でのみ使用します。キーは端末内に保存され、外部には送信されません。</p>
        </div>
        <div className="sgroup">
          <label className="slabel">バックアップ</label>
          <button className="sbtn ghost" onClick={exportAll}>書き出し（JSON）</button>
          <button className="sbtn ghost" onClick={() => importInp.current.click()}>読み込み</button>
          <input ref={importInp} type="file" accept="application/json,.json" hidden
            onChange={(e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ""; }} />
          <p className="snote">投稿・画像・動画をまとめて1ファイルに保存します。動画が多いとサイズが大きくなります。</p>
        </div>
        <div className="sgroup">
          <button className="sbtn danger" onClick={wipe}>すべて削除</button>
        </div>
        {msg && <div className="smsg">{msg}</div>}
        <div className="sver">MIND LOG {APP_VER}</div>
      </div>
    </div>
  );
}

/* ============ Lightbox ============ */
function Lightbox({ url, onClose }) {
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lbx"><Icon d="close" size={26} sw={2} /></button>
      <img src={url} alt="" />
    </div>
  );
}

/* ============ App ============ */
function App() {
  const [tab, setTab] = useState(() => sessionStorage.getItem("ml_tab") || "home");
  const [posts, setPosts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("ml_apikey") || "");
  const [lightbox, setLightbox] = useState(null);

  const reload = useCallback(async () => { const all = await dbGetAllPosts(); setPosts(all); setLoaded(true); }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { sessionStorage.setItem("ml_tab", tab); }, [tab]);

  const onPosted = useCallback((p) => setPosts((cur) => [p, ...cur]), []);
  const onEdit = useCallback((updated) => setPosts((cur) => cur.map((x) => (x.id === updated.id ? updated : x))), []);
  const onDelete = useCallback(async (post) => {
    if (!confirm("この投稿を削除しますか？")) return;
    (post.media || []).forEach((m) => { dropMediaUrl(m.id); dbDeleteMedia(m.id); });
    await dbDeletePost(post.id);
    setPosts((cur) => cur.filter((x) => x.id !== post.id));
  }, []);
  const onToggleFav = useCallback(async (post) => {
    const updated = { ...post, fav: !post.fav };
    await dbPutPost(updated);
    setPosts((cur) => cur.map((x) => (x.id === post.id ? updated : x)));
  }, []);
  const onOpen = useCallback((url) => setLightbox(url), []);

  const cardProps = { onDelete, onOpen, onToggleFav, onEdit };
  const tabs = [
    ["home", "ホーム", "home"],
    ["cal", "カレンダー", "cal"],
    ["search", "検索", "search"],
    ["fav", "お気に入り", "star"],
    ["analyze", "分析", "chart"],
  ];
  const order = tabs.map((t) => t[0]);

  const touch = useRef(null);
  function onTouchStart(e) {
    const el = e.target;
    if (el.closest && el.closest("textarea,input,video,.editbox,.calgrid,.sheet")) { touch.current = null; return; }
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = order.indexOf(tab);
    if (dx < 0 && i < order.length - 1) setTab(order[i + 1]);
    if (dx > 0 && i > 0) setTab(order[i - 1]);
  }

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">MIND LOG</div>
        <div className="sub">思ったことを、ためていく</div>
        <button className="gear" onClick={() => setSettings(true)} aria-label="設定"><Icon d="gear" size={21} /></button>
      </header>

      <main className="main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!loaded ? <div className="emptysm">読み込み中…</div> :
          tab === "home" ? <HomeView posts={posts} onPosted={onPosted} {...cardProps} /> :
          tab === "cal" ? <CalendarView posts={posts} {...cardProps} /> :
          tab === "search" ? <SearchView posts={posts} {...cardProps} /> :
          tab === "fav" ? <FavView posts={posts} {...cardProps} /> :
          <AnalyzeView posts={posts} apiKey={apiKey} openSettings={() => setSettings(true)} />}
      </main>

      <nav className="tabbar">
        {tabs.map(([k, label, ic]) => (
          <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            <Icon d={ic} size={23} fill={k === "fav" && tab === "fav"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {settings && <Settings onClose={() => setSettings(false)} posts={posts} reload={reload} apiKey={apiKey} setApiKey={setApiKey} />}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
