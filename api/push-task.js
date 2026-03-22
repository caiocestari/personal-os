const FIREBASE_API_KEY = 'AIzaSyCHBPkgIMiGKmNt8B2JIoxsQ1Jc5mAnTBg';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/bupa-delivery/databases/(default)/documents';

function toFS(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')         return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')         return { stringValue: v };
  if (Array.isArray(v))              return { arrayValue: { values: v.map(toFS) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFS(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFS(v) {
  if (!v)                  return null;
  if ('nullValue'    in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('stringValue'  in v) return v.stringValue;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fromFS);
  if ('mapValue'     in v) {
    const obj = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = fromFS(val);
    return obj;
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-push-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-push-token'];
  if (!token || token !== process.env.PUSH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const task = req.body;
  if (!task || !task.id || !task.title) {
    return res.status(400).json({ error: 'Task must have id and title' });
  }

  try {
    const getRes = await fetch(`${FIRESTORE_BASE}/kanban/board?key=${FIREBASE_API_KEY}`);
    const raw    = await getRes.json();
    if (raw.error) return res.status(500).json({ error: raw.error.message });

    const tasks = (raw.fields?.tasks?.arrayValue?.values || []).map(fromFS);
    const done  = (raw.fields?.done?.arrayValue?.values  || []).map(fromFS);

    if (tasks.find(t => t.id === task.id)) {
      return res.status(409).json({ error: `Task with id "${task.id}" already exists` });
    }

    tasks.push(task);

    const patchRes = await fetch(
      `${FIRESTORE_BASE}/kanban/board?key=${FIREBASE_API_KEY}`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: { tasks: toFS(tasks), done: toFS(done) } }),
      }
    );
    const patchData = await patchRes.json();
    if (patchData.error) return res.status(500).json({ error: patchData.error.message });

    return res.status(200).json({ success: true, task, total_tasks: tasks.length });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
