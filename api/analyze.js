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
- درجات الطحن: لقمع Omni على مكينة xBloom وعلى مطحنة K6.
- الصبات: 4 إلى 5 صبات بالملي ومعدل التدفق flow ووقت الانتظار.

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

    // قائمة بالنماذج المعتمدة بالترتيب
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.8-pro'];
    let lastErrorMsg = '';

    for (const model of candidateModels) {
      // تجربة كل نموذج مرتين مع انتظار ثانية في حال حدوث ضغط مؤقت
      for (let attempt = 1; attempt <= 2; attempt++) {
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
            const rawText = data.candidates[0].content.parts[0].text;
            const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            const recipe = JSON.parse(cleaned);
            return res.status(200).json(recipe);
          }

          lastErrorMsg = data.error?.message || 'خطأ غير معروف من السيرفر';

          // إذا كان الخطأ ضغط مؤقت، انتظر 1.5 ثانية قبل إعادة المحاولة
          if (response.status === 503 || lastErrorMsg.includes('demand')) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
        } catch (err) {
          lastErrorMsg = err.message;
        }
      }
    }

    return res.status(503).json({ error: 'الخادم يواجه ضغطاً كبيراً، تمت إعادة المحاولة تلقائياً وتعذر الوصول. يرجى الضغط مرة أخرى بعد قليل.' });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'حدث خطأ داخلي' });
  }
}
