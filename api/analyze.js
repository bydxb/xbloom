export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  }

  try {
    const { imageBase64, isIced } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'لم يتم إرسال صورة' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'مفتاح السيرفر غير مهيأ' });
    }

    const promptText = `
أنت خبير محاصيل قهوة مختصة (Q-Grader) وباريستا معتمد لمكينة xBloom Studio وقمع Omni Dripper الأصلي بفلتر Wave المسطح.
افحص صورة كيس القهوة المرفقة واستخرج البيانات المطبوعة عليها حرفياً:
1. اسم المحصول (bean_name)
2. المحمصة (roaster)
3. البلد والمنطقة (origin)
4. المعالجة (process: Washed, Natural, Anaerobic, Honey)
5. التحميص (roast_level)
6. الإيحاءات (notes)

ثم صمم وصفة مبرمجة ومطابقة لقمع Omni Dripper:
- إذا كان حاراً: نسبة 1:15 (15g بن إلى 225ml ماء).
- إذا كان آيس دريب (isIced = ${isIced}): نسبة مركزة 1:10 (16g بن، 160ml ماء ساخن + 90g ثلج بالسيرفر).
- الحرارة: للمغسول 93-94°C، للمجفف واللاهوائي 90-92°C.
- الصبات: 4 إلى 5 صبات مع تحديد كمية الماء بالملي، سرعة التدفق (flow بالجرام/ثانية المبرمجة لمكينة xBloom)، نمط الصب (Spiral أو Center)، ووقت الانتظار بالثواني.

أرجع النتيجة حصراً بصيغة JSON نظيفة بدون أي علامات markdown:
{
  "bean_name": "...",
  "origin": "...",
  "roaster": "...",
  "process": "...",
  "roast_level": "...",
  "notes": ["...", "..."],
  "dose": 15.0,
  "temp": 92,
  "xbloom_grind": "4.2",
  "k6_grind": "78 نقرة",
  "total_liquid": "...",
  "pours": [
    {"step": 1, "title": "ترطيب (Bloom)", "ml": 45, "flow": 2.2, "pattern": "Spiral", "wait": 40},
    {"step": 2, "title": "الصبة الأولى", "ml": 60, "flow": 2.8, "pattern": "Center", "wait": 20},
    {"step": 3
