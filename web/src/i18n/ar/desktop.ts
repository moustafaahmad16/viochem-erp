/** The Windows app: first start, sharing on the network, backups, and its e-invoice settings. */
export const desktop: Record<string, string> = {
  "Welcome to VIOCHEM": "مرحبًا بك في VIOCHEM",
  "Create the first admin. You can add everyone else afterwards, under Users.": "أنشئ أول مدير للنظام. يمكنك إضافة باقي المستخدمين بعد ذلك من صفحة المستخدمين.",
  "Password again": "تأكيد كلمة المرور",
  "Create admin and start": "إنشاء المدير والبدء",
  "Sign in instead. This computer already has users.": "سجّل الدخول بدلًا من ذلك. هذا الجهاز به مستخدمون بالفعل.",
  "The two passwords aren't the same.": "كلمتا المرور غير متطابقتين.",
  "Sharing and backups": "المشاركة والنسخ الاحتياطي",
  "VIOCHEM runs on this computer and keeps its data here": "يعمل VIOCHEM على هذا الجهاز ويحفظ بياناته عليه",
  "Open it on other devices": "افتحه من أجهزة أخرى",
  "Any computer or phone on the same Wi-Fi as this computer can open VIOCHEM in its browser, at:": "أي كمبيوتر أو موبايل على نفس شبكة الواي فاي مع هذا الجهاز يمكنه فتح VIOCHEM من المتصفح على العنوان:",
  "This computer must be on, with VIOCHEM open. Everyone signs in with their own user and sees the same data.":
    "يجب أن يكون هذا الجهاز يعمل وبرنامج VIOCHEM مفتوحًا. كل شخص يدخل بمستخدمه ويرى نفس البيانات.",
  Backups: "النسخ الاحتياطية",
  "Back up now": "نسخ احتياطي الآن",
  "Backed up.": "تم النسخ الاحتياطي.",
  "A full copy is saved once a day, and before every update. Keep the backup folder on a USB drive or a synced folder like OneDrive, so a copy survives if this computer doesn't.":
    "تُحفظ نسخة كاملة مرة يوميًا وقبل كل تحديث. اجعل مجلد النسخ على فلاشة أو مجلد متزامن مثل OneDrive حتى تبقى نسخة لو تعطل هذا الجهاز.",
  "Backup folder": "مجلد النسخ الاحتياطي",
  "Backups to keep": "عدد النسخ المحفوظة",
  "Keep between 1 and 365 backups.": "احتفظ بعدد بين 1 و 365 نسخة.",
  "To restore a backup, use Restore from backup in the File menu of the app on this computer.": "لاسترجاع نسخة، استخدم «استرجاع من نسخة احتياطية» من قائمة File في البرنامج على هذا الجهاز.",
  Backup: "النسخة",
  Saved: "وقت الحفظ",
  Size: "الحجم",
  "No backups yet.": "لا توجد نسخ احتياطية بعد.",
  "E-seal on the computer VIOCHEM is installed on": "الختم الإلكتروني على الجهاز المثبّت عليه VIOCHEM",
  "Client ID": "معرّف العميل (Client ID)",
  "Client secret": "الرمز السري (Client secret)",
  "Leave empty to keep the saved one": "اتركه فارغًا للإبقاء على المحفوظ",
  "From the ETA portal, under ERP system registration": "من بوابة مصلحة الضرائب، في تسجيل نظام ERP",
  "Save connection": "حفظ بيانات الاتصال",
  "Plug the e-seal USB token into this computer, and install its driver from its supplier (Egypt Trust or MCDR) if it isn't already.":
    "ركّب فلاشة الختم الإلكتروني في هذا الجهاز، وثبّت تعريفها من الجهة المصدرة (Egypt Trust أو MCDR) إن لم يكن مثبتًا.",
  "In the app's E-invoice menu, choose Start e-seal signer, and enter the token's PIN when Windows asks.":
    "من قائمة E-invoice في البرنامج اختر Start e-seal signer، وأدخل الرقم السري للفلاشة عندما يطلبه ويندوز.",
  "Invoices sent from any device on the network are then signed here. The app starts the signer again each time it opens.":
    "بعد ذلك تُوقّع هنا الفواتير المرسلة من أي جهاز على الشبكة. يشغّل البرنامج برنامج التوقيع تلقائيًا كل مرة يُفتح.",
  "The ETA client ID and secret aren't set. Enter them under Settings, E-invoice.": "لم يتم ضبط معرّف العميل والرمز السري. أدخلهما من الإعدادات، الفاتورة الإلكترونية.",
  "The e-seal signer isn't running. Plug in the USB token, then choose Start e-seal signer in the app's E-invoice menu.":
    "برنامج التوقيع غير مشغّل. ركّب فلاشة الختم ثم اختر Start e-seal signer من قائمة E-invoice في البرنامج.",
  "Couldn't reach the signing service at ETA_SIGNER_URL.": "تعذّر الاتصال بخدمة التوقيع على ETA_SIGNER_URL.",
  "Clear all data": "مسح كل البيانات",
  "Start again with an empty system": "ابدأ من جديد بنظام فارغ",
  "This deletes every product, customer, supplier, invoice, quotation, credit note, shipment, purchase order, payment, cheque, expense, bank and cash account, and all stock. Numbering starts again from 1.":
    "سيتم حذف كل الأصناف والعملاء والموردين والفواتير وعروض الأسعار والإشعارات الدائنة والشحنات وأوامر الشراء والمدفوعات والشيكات والمصروفات وحسابات البنوك والخزائن وكل المخزون. ويبدأ الترقيم من 1 من جديد.",
  "Users, e-invoice settings and the chart of accounts are kept.": "يتم الاحتفاظ بالمستخدمين وإعدادات الفاتورة الإلكترونية ودليل الحسابات.",
  "Now: {items} products, {customers} customers, {suppliers} suppliers, {invoices} invoices, {shipments} shipments.":
    "حاليًا: {items} صنف، {customers} عميل، {suppliers} مورد، {invoices} فاتورة، {shipments} شحنة.",
  "A backup is saved first, so it can be undone with Restore from backup in the File menu.": "تُحفظ نسخة احتياطية أولًا، ويمكن التراجع باختيار Restore from backup من قائمة File.",
  "This can't be undone.": "لا يمكن التراجع عن ذلك.",
  "Your password": "كلمة المرور الخاصة بك",
  "That password isn't right.": "كلمة المرور غير صحيحة.",
  "All data is cleared.": "تم مسح كل البيانات.",
  "Delete all data? This removes every product, customer, invoice and record.": "حذف كل البيانات؟ سيتم حذف كل الأصناف والعملاء والفواتير وكل السجلات.",
};
