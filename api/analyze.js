export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الطريقة غير مسموحة' });
  }

  try {
    const { imageBase64, isIced } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'لم يتم إرسال صورة' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'مفتاح السيرفر غير مهيأ' });
    }

    const promptText = `
أنت خبير محاصيل قهوة مختصة وباريستا معتمد لمكينة xBloom Studio وقمع Omni Dripper الأصلي بفلتر Wave المسطح.
افحص صورة كيس القهوة واستخرج بيانات المحصول وصمم وصفة مبرمجة مطابقة لقمع Omni:
- إذا كان حاراً: 15g بن إلى 225ml ماء.
- إذا كان آيس دريب (${isIced}): 16g بن، 160ml ماء ساخن + 90g ثلج.
- درجات الطحن: لقمع Omni على مكينة xBloom ومطحنة K6 اليدوية.
- الصبات: 4 صبات بالملي ومعدل التدفق flow ووقت الانتظار.

أرجع النتيجة حصراً بصيغة JSON نظيفة فقط:
{
  "bean_name": "اسم المحصول",
  "origin": "البلد والمنطقة",
  "roaster": "المحمصة",
  "process": "المعالجة",
  "roast_level": "التحميص",
  "notes": ["إيحاء 1", "إيحاء 2"],
  "dose": 15.0,
  "temp": 92,
  "xbloom_grind": "4.2",
  "k6_grind": "78 نقرة",
  "total_liquid": "225ml",
  "pours": [
    {"step": 1, "title": "ترطيب (Bloom)", "ml": 45, "flow": 2.2, "pattern": "Spiral", "wait": 40},
    {"step": 2, "title": "الصبة الأولى", "ml": 60, "flow": 2.8, "pattern": "Center", "wait": 20},
    {"step": 3, "title": "الصبة الثانية", "ml": 60, "flow": 2.5, "pattern": "Spiral", "wait": 20},
    {"step": 4, "title": "صبة ختامية", "ml": 60, "flow": 2.0, "pattern": "Center", "wait": 25}
  ]
}
`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'خطأ في معالجة النموذج' });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'لم يتم استلام نص من النموذج' });
    }

    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(cleaned));

  } catch (error) {
    return res.status(500).json({ error: error.message || 'خطأ داخلي' });
  }
}
