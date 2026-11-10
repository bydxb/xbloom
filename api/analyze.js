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

    // هنا نطلب منه التحليل الكيميائي والذاتي لكل محصول دون إعطائه أرقام صبات مسبقة
    const promptText = `
أنت خبير محاصيل قهوة مختصة (Q-Grader) وباريستا محترف متخصص في مكينة xBloom Studio وقمع Omni Dripper الأصلي بفلتر مسطح (Flat-bottom Wave).

مهمتك:
1. اقرأ صورة كيس القهوة بدقة متناهية واستخرج: المحمصة، اسم المحصول، الدولة، المنطقة، السلالة، الارتفاع، نوع المعالجة، درجة التحميص، والإيحاءات.
2. بناءً على هذه المتغيرات تحديداً (المعالجة، الكثافة المتوقعة من الارتفاع، والإيحاءات المطلوبة):
   - ابتكر وصفة استخلاص متكاملة مخصصة لهذا المحصول بعينه لإبراز أجمل إيحاءاته.
   - قيود طاحونة xBloom Studio: التدريج من 1 إلى 80 Click فقط كأرقام صحيحة (ممنوع الفواصل العشرية). اختر الكليك الدقيق المناسب لقمع Omni بناءً على معالجة هذا المحصول.
   - اختر الحرارة المناسبة بدقة (بين 88°C و 94°C) لخدمة المعالجة ونقاء الكوب.
   - هندسة الصبات: صمم عدد الصبات وتوزيع الماء والتدفق (flow rate بين 1.6g/s و 3.2g/s) ونمط الصب (Center أو Spiral) المناسب تماماً لكثافة وسرعة نزول هذا البن تحديداً في قمع Omni.
   - إذا كان التحضير حاراً: استخلص 15g بن بإجمالي ماء 225ml.
   - إذا كان التحضير مثلاً آيس دريب (isIced = ${isIced}): صمم وصفة مركزة تعتمد 16g بن و 160ml ماء ساخن و 90g ثلج.

ممنوع استخدام قيم ثابتة أو متكررة. حلل المحصول كحالة فريدة من نوعها.

أرجع النتيجة بصيغة JSON نظيفة فقط دون أي نصوص أو markdown:
{
  "bean_name": "اسم المحصول",
  "origin": "البلد والمنطقة والارتفاع",
  "roaster": "المحمصة",
  "process": "المعالجة",
  "roast_level": "التحميص",
  "notes": ["إيحاء 1", "إيحاء 2", "إيحاء 3"],
  "dose": 15.0,
  "temp": 91,
  "xbloom_grind": "52 Click",
  "k6_grind": "75 نقرة",
  "total_liquid": "225ml",
  "pours": [
    {
      "step": 1,
      "title": "اسم المرحلة",
      "ml": 45,
      "flow": 2.0,
      "pattern": "Spiral",
      "wait": 35
    }
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
          temperature: 0.4
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'خطأ في معالجة النموذج' });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(cleaned));

  } catch (error) {
    return res.status(500).json({ error: error.message || 'خطأ داخلي' });
  }
}
