const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const DATA = path.join(process.env.DATA_DIR || __dirname, 'data.json');
const bnDigits = '০১২৩৪৫৬৭৮৯';
const toEn = s => String(s).replace(/[০-৯]/g, d => bnDigits.indexOf(d));
const bn = s => String(s).replace(/\d/g, d => bnDigits[d]);

const seed = [
  { id: 1, name: 'ডা. মিজানুর রহমান (নাক-কান-গলা)', pin: '1001', fee: 500, limit: 20, start: '16:00', interval: 10, days: [4], schedule: 'প্রতি বৃহস্পতিবার' },
  { id: 2, name: 'ডা. জয়ন্ত সাহা (অর্থোপেডিক্স)', pin: '1002', fee: 500, limit: 15, start: '15:00', interval: 12, days: [0], schedule: 'প্রতি রবিবার বিকাল ৩টা থেকে রাত ১০টা' },
  { id: 3, name: 'ডা. দীপঙ্কর সাহা (মেডিসিন ও শিশু)', pin: '1003', fee: 500, limit: 25, start: '10:00', interval: 10, days: [6, 0, 1, 2, 3, 4], schedule: 'প্রতি শনিবার থেকে বৃহস্পতিবার সারাদিন' },
  { id: 4, name: 'ডা. মোহাম্মদ ওমর ফয়সাল (মেডিসিন ও বক্ষ)', pin: '1004', fee: 500, limit: 25, start: '15:00', interval: 10, days: [0, 1, 2, 3, 4, 5, 6], schedule: 'প্রতিদিন বিকাল ৩টা থেকে রাত ১০টা' },
  { id: 5, name: 'ডা. রেজিনা সুলতানা (গাইনি ও প্রসূতি)', pin: '1005', fee: 500, limit: 20, start: '16:00', interval: 12, days: [0, 1, 2, 3, 4, 5, 6], schedule: 'শনি থেকে বৃহস্পতিবার বিকাল ৪টা - রাত ৮টা; শুক্রবার সারাদিন' },
  { id: 6, name: 'ডা. তানভীর হায়াত (হৃদরোগ)', pin: '1006', fee: 500, limit: 15, start: '15:00', interval: 15, days: [4], schedule: 'প্রতি বৃহস্পতিবার বিকাল ৩টা থেকে রাত ৮টা' }
];

let db = fs.existsSync(DATA)
  ? JSON.parse(fs.readFileSync(DATA, 'utf8'))
  : { doctors: seed, bookings: [], nextId: 1 };

function save() {
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA);
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise(resolve => {
  let s = '';
  req.on('data', c => (s += c));
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
});
const docOf = id => db.doctors.find(d => d.id === id);
const authDoc = (id, pin) => { const d = docOf(id); return d && d.pin === String(pin) ? d : null; };
const activeCount = (doctorId, date) =>
  db.bookings.filter(b => b.doctorId === doctorId && b.date === date && b.status !== 'বাতিল').length;
const dayList = (doctorId, date) =>
  db.bookings.filter(b => b.doctorId === doctorId && b.date === date).sort((a, b) => a.serial - b.serial);
function timeOf(d, serial) {
  const [h, m] = d.start.split(':').map(Number);
  const t = h * 60 + m + (serial - 1) * d.interval;
  return bn(String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
}
const view = (d, date) => dayList(d.id, date).filter(x => x.status !== 'বাতিল').map(x => ({ ...x, time: timeOf(d, x.serial) }));
function applyAction(bk, act) {
  if (act === 'paid') bk.paid = true;
  if (act === 'call') bk.status = 'ডাকা হয়েছে';
  if (act === 'done') bk.status = 'দেখা সম্পন্ন';
  if (act === 'absent') bk.status = 'আসেনি';
  if (act === 'cancel') bk.status = 'বাতিল';
  if (act === 'report') bk.report = !bk.report;
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (req.method === 'GET' && url === '/api/doctors') {
    return send(res, 200, db.doctors.map(({ pin, ...rest }) => rest));
  }
  if (req.method !== 'POST' || !url.startsWith('/api/')) return send(res, 404, { error: 'not found' });

  const b = await readBody(req);
  const route = url.slice(5);

  if (route === 'book') {
    const name = String(b.name || '').trim();
    const phone = toEn(b.phone || '').trim();
    const doc = docOf(+b.doctorId);
    if (!doc) return send(res, 400, { error: 'ডাক্তার পাওয়া যায়নি' });
    if (!name || !b.age || !b.date) return send(res, 400, { error: 'সব তথ্য পূরণ করুন' });
    if (!/^01\d{9}$/.test(phone)) return send(res, 400, { error: 'সঠিক মোবাইল নম্বর দিন (01xxxxxxxxx)' });
    if (!doc.days.includes(new Date(b.date + 'T00:00').getDay()))
      return send(res, 400, { error: 'এই ডাক্তার ওই দিন রোগী দেখেন না। সময়সূচি: ' + doc.schedule });
    if (db.bookings.some(x => x.phone === phone && x.doctorId === doc.id && x.date === b.date && x.status !== 'বাতিল'))
      return send(res, 400, { error: 'এই রোগী ইতিমধ্যে এই তারিখে এই ডাক্তারের সিরিয়াল নিয়েছেন' });
    if (activeCount(doc.id, b.date) >= doc.limit)
      return send(res, 400, { error: 'দুঃখিত, এই তারিখের সব সিরিয়াল পূর্ণ হয়ে গেছে' });
    const serial = db.bookings.filter(x => x.doctorId === doc.id && x.date === b.date).length + 1;
    db.bookings.push({ id: db.nextId++, doctorId: doc.id, date: b.date, serial, name, age: b.age, phone,
      status: 'অপেক্ষমাণ', fee: doc.fee, paid: false, report: false });
    save();
    return send(res, 200, { ok: true, serial: bn(serial), time: timeOf(doc, serial), doctor: doc.name, fee: doc.fee });
  }

  if (route === 'mybookings') {
    const phone = toEn(b.phone || '');
    const list = db.bookings.filter(x => x.phone === phone).map(x => ({
      ...x, doctorName: docOf(x.doctorId).name, time: timeOf(docOf(x.doctorId), x.serial)
    }));
    return send(res, 200, { list });
  }

  if (route === 'cancel') {
    const bk = db.bookings.find(x => x.id === +b.id && x.phone === toEn(b.phone || ''));
    if (!bk) return send(res, 404, { error: 'সিরিয়াল পাওয়া যায়নি' });
    if (bk.status !== 'অপেক্ষমাণ' || bk.paid) return send(res, 400, { error: 'এই সিরিয়াল এখন বাতিল করা যাবে না' });
    applyAction(bk, 'cancel');
    save();
    return send(res, 200, { ok: true });
  }

  if (route === 'doctor/list') {
    const d = authDoc(+b.doctorId, b.pin);
    if (!d) return send(res, 401, { error: 'পিন ভুল' });
    return send(res, 200, { list: view(d, b.date) });
  }

  if (route === 'doctor/action') {
    const d = authDoc(+b.doctorId, b.pin);
    if (!d) return send(res, 401, { error: 'পিন ভুল' });
    const bk = db.bookings.find(x => x.id === +b.id && x.doctorId === d.id);
    if (!bk) return send(res, 404, { error: 'রোগী পাওয়া যায়নি' });
    applyAction(bk, b.action);
    save();
    return send(res, 200, { list: view(d, bk.date) });
  }

  if (route === 'doctor/next') {
    const d = authDoc(+b.doctorId, b.pin);
    if (!d) return send(res, 401, { error: 'পিন ভুল' });
    const next = dayList(d.id, b.date).find(x => x.status === 'অপেক্ষমাণ');
    if (next) { applyAction(next, 'call'); save(); }
    return send(res, 200, { called: !!next, list: view(d, b.date) });
  }

  if (route.startsWith('admin/')) {
    if (String(b.pin) !== ADMIN_PIN) return send(res, 401, { error: 'অ্যাডমিন পিন ভুল' });
    if (route === 'admin/list') {
      const d = docOf(+b.doctorId);
      return send(res, 200, { list: view(d, b.date), count: activeCount(d.id, b.date), limit: d.limit });
    }
    if (route === 'admin/action') {
      const bk = db.bookings.find(x => x.id === +b.id);
      if (!bk) return send(res, 404, { error: 'রোগী পাওয়া যায়নি' });
      applyAction(bk, b.action);
      save();
      return send(res, 200, { ok: true });
    }
    if (route === 'admin/limit') {
      const d = docOf(+b.doctorId);
      const n = parseInt(b.limit, 10);
      if (n > 0) d.limit = n;
      save();
      return send(res, 200, { ok: true });
    }
    if (route === 'admin/doctor') {
      const x = b.doctor || {};
      if (!x.name || !x.pin) return send(res, 400, { error: 'নাম ও পিন দিন' });
      if (!Array.isArray(x.days) || !x.days.length) return send(res, 400, { error: 'কমপক্ষে একটি দিন বেছে নিন' });
      if (db.doctors.some(d => d.pin === String(x.pin))) return send(res, 400, { error: 'এই পিন অন্য ডাক্তার ব্যবহার করছেন' });
      const id = Math.max(0, ...db.doctors.map(d => d.id)) + 1;
      db.doctors.push({ id, name: String(x.name).trim(), pin: String(x.pin), fee: +x.fee || 0,
        limit: +x.limit || 20, start: x.start || '16:00', interval: +x.interval || 10,
        days: x.days.map(Number), schedule: x.schedule || 'সময়সূচি যোগ করা হয়নি' });
      save();
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log('ডাক্তার সিরিয়াল সার্ভার চালু: http://localhost:' + PORT));
