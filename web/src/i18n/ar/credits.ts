/** Credit notes and returns: goods sent back and prices reduced after an invoice. */
export const credits: Record<string, string> = {
  // List and detail
  "Credit note": "إشعار دائن",
  "Goods returned and prices reduced after an invoice. Start one from the invoice.": "البضاعة المرتجعة والتخفيضات في السعر بعد الفاتورة. ابدأ الإشعار من الفاتورة نفسها.",
  "No credit notes here.": "لا توجد إشعارات دائنة هنا.",
  "No products on this credit note yet.": "لا توجد أصناف في هذا الإشعار بعد.",
  "Back in stock": "عادت إلى المخزون",
  Yes: "نعم",
  "No, price only": "لا، تخفيض سعر فقط",
  "Product on the invoice": "الصنف في الفاتورة",
  "{product} · {qty} {unit} at {price} · {left} {unit} can still be credited": "{product} · {qty} {unit} بسعر {price} · يمكن إضافة {left} {unit} أخرى للإشعار",
  "Leave empty for the invoice price. Enter less to credit only part of the price.": "اتركه فارغًا لاستخدام سعر الفاتورة. أدخل سعرًا أقل لرد جزء من السعر فقط.",
  "The goods came back: put them back in stock": "البضاعة رُدّت: أعدها إلى المخزون",
  "Add to credit note": "إضافة إلى الإشعار",
  "Post credit note": "ترحيل الإشعار الدائن",
  "Posting reduces what the customer owes and puts returned goods back into the lots they came from.": "الترحيل يخفض المستحق على العميل ويعيد البضاعة المرتجعة إلى التشغيلات التي خرجت منها.",
  "Cancel credit note": "إلغاء الإشعار الدائن",
  "The customer owes the amount again and returned goods are taken back out of stock. The number stays used.": "يعود المبلغ مستحقًا على العميل وتُسحب البضاعة المرتجعة من المخزون مرة أخرى. يظل الرقم مستخدمًا.",
  "Credit for {number}": "إشعار دائن عن {number}",

  // On the invoice
  "Credit note or return": "إشعار دائن أو مرتجع",
  "For goods sent back or a lower price agreed after the invoice. You choose the products next.": "للبضاعة المرتجعة أو لسعر أقل اتُّفق عليه بعد الفاتورة. تختار الأصناف في الخطوة التالية.",
  "e.g. 2 drums damaged in delivery": "مثال: براميل تالفة أثناء التسليم",
  "Start a credit note": "بدء إشعار دائن",
  Credited: "المردود بإشعارات دائنة",

  // Stock and reports
  Returned: "مرتجع",
  from: "من",
  "Price allowances": "تخفيضات في السعر",

  // Messages
  "Only draft credit notes can be changed.": "لا يمكن تعديل إلا الإشعارات الدائنة المسودة.",
  "Say why the customer is being credited.": "اذكر سبب الإشعار الدائن للعميل.",
  "{number} isn't posted, so it can't be credited.": "{number} غير مرحّلة، لذلك لا يمكن عمل إشعار دائن عليها.",
  "A credit note can't be dated before its invoice.": "لا يمكن أن يكون تاريخ الإشعار الدائن قبل تاريخ فاتورته.",
  "Only {qty} {unit} of {product} can still be credited on this invoice.": "يمكن إضافة {qty} {unit} فقط من {product} للإشعار على هذه الفاتورة.",
  "That product isn't on this credit note's invoice.": "هذا الصنف غير موجود في فاتورة هذا الإشعار.",
  "The price credited can't be more than the invoice price.": "لا يمكن أن يزيد السعر المردود على سعر الفاتورة.",
  "Add at least one product to the credit note.": "أضف صنفًا واحدًا على الأقل إلى الإشعار الدائن.",
  "More is being returned than was taken out of stock for this invoice.": "الكمية المرتجعة أكبر مما خرج من المخزون لهذه الفاتورة.",
  "Only posted credit notes can be cancelled.": "لا يمكن إلغاء إلا الإشعارات الدائنة المرحّلة.",
  "Lot {lot} no longer has the {qty} that came back, so this credit note can't be cancelled.": "التشغيلة {lot} لم تعد بها الكمية المرتجعة ({qty})، لذلك لا يمكن إلغاء هذا الإشعار.",
  "Cancel its credit notes first.": "ألغِ الإشعارات الدائنة الخاصة بها أولًا.",
  "Send {number} to the tax authority first.": "أرسل {number} إلى مصلحة الضرائب أولًا.",
  "Only posted credit notes can be sent to the tax authority.": "لا يمكن إرسال إلا الإشعارات الدائنة المرحّلة إلى مصلحة الضرائب.",
  "This credit note is already with the tax authority.": "هذا الإشعار موجود بالفعل لدى مصلحة الضرائب.",
  "This credit note hasn't been sent to the tax authority.": "لم يُرسل هذا الإشعار إلى مصلحة الضرائب.",
  "Posted. Returned goods are back in stock.": "تم الترحيل. عادت البضاعة المرتجعة إلى المخزون.",
  "Cancelled. Returned goods have been taken out of stock again.": "تم الإلغاء. سُحبت البضاعة المرتجعة من المخزون مرة أخرى.",
};
