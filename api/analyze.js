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
    {"step": 3, "title": "الصبة الثانية", "ml": 60, "flow": 2.5, "pattern": "Spiral", "wait": 20},
    {"step": 4, "title": "صبة ختامية", "ml": 60, "flow": 2.0, "pattern": "Center", "wait": 25}
  ]
}
`;

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // قائمة نماذج بديلة للتبديل التلقائي في حال واجه أحدهما ضغطاً
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const recipeJson = JSON.parse(data.candidates[0].content.parts[0].text);
          return res.status(200).json(recipeJson);
        }
        lastError = data.error?.message || 'خطأ في الاستجابة';
      } catch (err) {
        lastError = err.message;
      }
    }

    return res.status(503).json({ error: lastError || 'تعذر تحليل الصورة حالياً، يرجى إعادة المحاولة' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'حدث خطأ غير متوقع' });
  }
}
