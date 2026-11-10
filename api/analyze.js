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
      return res.status(500).json({ error: 'مفتاح GEMINI_API_KEY غير موجود في Vercel' });
    }

    // الذكاء الاصطناعي وظيفته هنا فقط قراءة بيانات الكيس بدقة 100% دون التلاعب بأرقام المكينة
    const promptText = `
افحص صورة كيس القهوة واستخرج بيانات المحصول بدقة متناهية.
أرجع النتيجة بصيغة JSON نظيفة فقط:
{
  "bean_name": "اسم المحصول كاملاً",
  "roaster": "اسم المحمصة",
  "origin": "دولة المنشأ والمنطقة والارتفاع إن وجد",
  "process": "نوع المعالجة بدقة (Washed, Natural, Anaerobic, Honey, Infused)",
  "roast_level": "درجة التحميص (Light, Medium, Dark)",
  "notes": ["إيحاء 1", "إيحاء 2", "إيحاء 3"]
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
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const beanData = JSON.parse(cleaned);

    // هندسة الوصفة برمجياً 100% وفق كتالوج xBloom Studio وقمع Omni لتفادي أي تخريف
    const processStr = (beanData.process || '').toLowerCase();
    const isAnaerobic = processStr.includes('anaerobic') || processStr.includes('ferment') || processStr.includes('تخمير') || processStr.includes('لاهوائي') || processStr.includes('infused');
    const isWashed = processStr.includes('washed') || processStr.includes('مغسول');

    let finalRecipe = {};

    if (isIced) {
      // آيس دريب (Flash Chill) هندسي دقيق لمكينة Studio
      finalRecipe = {
        ...beanData,
        dose: 18.0,
        temp: isAnaerobic ? 91 : (isWashed ? 94 : 93),
        xbloom_grind: isAnaerobic ? "52 Click" : (isWashed ? "46 Click" : "49 Click"),
        k6_grind: isAnaerobic ? "76 نقرة" : (isWashed ? "70 نقرة" : "73 نقرة"),
        total_liquid: "150ml ماء ساخن + 100g ثلج بالسيرفر",
        pours: [
          { step: 1, title: "ترطيب وتفتيح (Bloom)", ml: 40, flow: 3.0, pattern: "Center", wait: 40 },
          { step: 2, title: "استخلاص القوام والتركيز", ml: 55, flow: 3.2, pattern: "Spiral", wait: 20 },
          { step: 3, title: "صبة ختامية مركزة", ml: 55, flow: 3.1, pattern: "Circular", wait: 20 }
        ]
      };
    } else {
      // قهوة حارة متوازنة ومضبوطة التدفق والكميات لقمع Omni
      const temp = isAnaerobic ? 90 : (isWashed ? 93 : 92);
      const grind = isAnaerobic ? "53 Click" : (isWashed ? "44 Click" : "48 Click");
      const k6 = isAnaerobic ? "78 نقرة" : (isWashed ? "68 نقرة" : "74 نقرة");

      finalRecipe = {
        ...beanData,
        dose: 15.0,
        temp: temp,
        xbloom_grind: grind,
        k6_grind: k6,
        total_liquid: "225ml",
        pours: [
          { step: 1, title: "ترطيب متجانس (Bloom)", ml: 45, flow: 3.0, pattern: "Spiral", wait: 35 },
          { step: 2, title: "الصبة الأولى - تفعيل النكهات", ml: 60, flow: 3.3, pattern: "Spiral", wait: 20 },
          { step: 3, title: "الصبة الثانية - التوازن", ml: 60, flow: 3.2, pattern: "Circular", wait: 20 },
          { step: 4, title: "صبة ختامية نقية", ml: 60, flow: 3.0, pattern: "Center", wait: 25 }
        ]
      };
    }

    return res.status(200).json(finalRecipe);

  } catch (error) {
    return res.status(500).json({ error: error.message || 'خطأ في معالجة الوصفة' });
  }
}
