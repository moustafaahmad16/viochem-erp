/** Signing e-invoices with the e-seal. */
export const eta: Record<string, string> = {
  "Preparing…": "جارٍ التجهيز…",
  "Signing with the e-seal…": "جارٍ التوقيع بالختم الإلكتروني…",
  "Sending…": "جارٍ الإرسال…",
  "The e-seal signer isn't running on this computer. Start VIOCHEM signer, then send again.": "برنامج التوقيع غير مشغّل على هذا الجهاز. شغّل VIOCHEM signer ثم أرسل مرة أخرى.",
  "The e-seal signer couldn't sign it: {reason}": "لم يتمكن برنامج التوقيع من التوقيع: {reason}",
  "The document changed while it was being signed. Send it again.": "تغيّر المستند أثناء توقيعه. أرسله مرة أخرى.",
  "Signed by the e-seal on this computer. VIOCHEM signer must be running.": "يتم التوقيع بالختم الإلكتروني على هذا الجهاز. يجب أن يكون VIOCHEM signer مشغّلًا.",
  Signing: "التوقيع",
  "Not needed for version 0.9": "غير مطلوب للإصدار 0.9",
  "Signing service (ETA_SIGNER_URL)": "خدمة توقيع (ETA_SIGNER_URL)",
  "E-seal on the computer that sends": "الختم الإلكتروني على الجهاز المرسِل",
  "These are kept in Vercel, not here: ETA_ENVIRONMENT, ETA_CLIENT_ID and ETA_CLIENT_SECRET. After changing them, redeploy.":
    "تُحفظ هذه في Vercel وليس هنا: ETA_ENVIRONMENT وETA_CLIENT_ID وETA_CLIENT_SECRET. بعد تغييرها أعد النشر.",
  "E-seal signer": "برنامج التوقيع بالختم الإلكتروني",
  "On the computer the e-seal USB token is plugged into, install the token's driver from its supplier (Egypt Trust or MCDR) if it isn't already.":
    "على الجهاز المتصل به فلاشة الختم الإلكتروني، ثبّت تعريف الفلاشة من الجهة المصدرة (Egypt Trust أو MCDR) إن لم يكن مثبتًا.",
  "On that computer, download VIOCHEM signer and double-click it. If Windows warns about the file, choose More info, then Run anyway.":
    "على نفس الجهاز، نزّل VIOCHEM signer وافتحه بنقرتين. إذا ظهر تحذير من ويندوز، اختر More info ثم Run anyway.",
  "Enter the token's PIN when Windows asks. Leave the black window open; it signs each invoice you send.":
    "أدخل الرقم السري للفلاشة عندما يطلبه ويندوز. اترك النافذة السوداء مفتوحة، فهي التي توقّع كل فاتورة ترسلها.",
  "Send e-invoices from that computer. If the browser asks to allow access to devices on your network, allow it.":
    "أرسل الفواتير الإلكترونية من هذا الجهاز. إذا طلب المتصفح السماح بالوصول إلى الأجهزة على شبكتك، اسمح بذلك.",
  "To start it with Windows, put a shortcut to the file in the Startup folder (press Win+R, type shell:startup).":
    "لتشغيله مع ويندوز، ضع اختصارًا للملف في مجلد بدء التشغيل (اضغط Win+R واكتب shell:startup).",
  "Download VIOCHEM signer": "تنزيل VIOCHEM signer",
  "Check the signer on this computer": "فحص برنامج التوقيع على هذا الجهاز",
  "Running. E-seal: {subject}, valid until {date}.": "يعمل. الختم: {subject}، صالح حتى {date}.",
  "VIOCHEM signer isn't running on this computer.": "برنامج VIOCHEM signer غير مشغّل على هذا الجهاز.",
  "The signer only signs for this website, and only while the token is plugged in. The invoice never leaves VIOCHEM's systems except to the tax authority.":
    "لا يوقّع البرنامج إلا لهذا الموقع، وفقط أثناء توصيل الفلاشة. ولا تخرج الفاتورة من أنظمة VIOCHEM إلا إلى مصلحة الضرائب.",
  "This website may not use the e-seal.": "غير مسموح لهذا الموقع باستخدام الختم الإلكتروني.",
  "No e-seal certificate found. Plug in the USB token, make sure its driver is installed, and start the signer again.":
    "لم يُعثر على شهادة الختم الإلكتروني. وصّل الفلاشة وتأكد من تثبيت تعريفها، ثم شغّل البرنامج مرة أخرى.",
};
