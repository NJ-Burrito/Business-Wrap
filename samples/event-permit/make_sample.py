"""Writes the anonymised sample service in both editions. Invented content only.
Run: PYTHONUTF8=1 python samples/event-permit/make_sample.py"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def svg(a, b, c, rtl):
    order = [a, b, c][::-1] if rtl else [a, b, c]
    xs = [40, 300, 560]
    boxes = ''.join(
        f'<rect x="{x}" y="60" width="200" height="70" rx="10" fill="#dde8eb" stroke="#264d5c" stroke-width="2"/>'
        f'<text x="{x + 100}" y="102" text-anchor="middle" font-size="18" fill="#15303b">{t}</text>'
        for x, t in zip(xs, order))
    if rtl:
        arrows = ''.join(f'<line x1="{x + 260}" y1="95" x2="{x + 204}" y2="95" stroke="#4d545b" stroke-width="2" marker-end="url(#a)"/>' for x in xs[:2])
    else:
        arrows = ''.join(f'<line x1="{x + 200}" y1="95" x2="{x + 256}" y2="95" stroke="#4d545b" stroke-width="2" marker-end="url(#a)"/>' for x in xs[:2])
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 190" width="800" height="190">'
            '<defs><marker id="a" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#4d545b"/></marker></defs>' + boxes + arrows + '</svg>')


def story(id_, name, as_, want, so, acc, actions=None, dictionary=None):
    s = {"id": id_, "name": name, "as": as_, "want": want, "so": so, "acceptance": acc}
    if actions: s["actions"] = actions
    if dictionary: s["dictionary"] = dictionary
    return s


def doc(t):
    return {
        "service": "event-permit", "composedAt": "2026-10-27T00:00:00Z",
        "control": t["control"],
        "revisions": [["V0.1", "2026-10-01"], ["V1.0", "2026-10-27"]],
        "approvals": [],
        "chapters": [
            {"number": "1", "title": t["c1"], "sections": [
                {"number": "1.1", "title": t["s11"], "blocks": [{"kind": "prose", "paragraphs": t["p11"]}]},
                {"number": "1.2", "title": t["s12"], "blocks": [{"kind": "prose", "paragraphs": t["p12"]}]}]},
            {"number": "2", "title": t["c2"], "sections": [
                {"number": "2.1", "title": t["s21"], "blocks": [{"kind": "prose", "paragraphs": [t["p21"]]},
                                                                {"kind": "table", "columns": t["t21c"], "rows": t["t21"]}]},
                {"number": "2.2", "title": t["s22"], "blocks": [{"kind": "prose", "paragraphs": [t["p22"]]},
                                                                {"kind": "table", "columns": t["t22c"], "rows": t["t22"]}]},
                {"number": "2.3", "title": t["s23"], "blocks": [{"kind": "table", "columns": t["t23c"], "rows": t["t23"]}]}]},
            {"number": "3", "title": t["c3"], "sections": [
                {"number": "3.1", "title": t["c3"], "blocks": [{"kind": "figure", "caption": t["fig"], "svg": svg(*t["steps"], t["rtl"]), "compact": True}]}]},
            {"number": "4", "title": t["c4"], "sections": [
                {"number": "4.1", "title": t["c4"], "blocks": [{"kind": "table", "columns": t["t4c"], "rows": t["t4"]}]}]},
            {"number": "5", "title": t["c5"], "sections": [
                {"number": "5.1", "title": t["s51"], "blocks": [{"kind": "subhead", "text": t["h51"]},
                                                                {"kind": "stories", "number": "5.1", "lead": t["lead"], "items": [t["us1"]]}]},
                {"number": "5.2", "title": t["s52"], "blocks": [{"kind": "subhead", "text": t["h52"]},
                                                                {"kind": "stories", "number": "5.2", "items": [t["us2"]]}]}]},
        ],
        "openQuestions": [],
    }


AR = {
    "rtl": True,
    "control": {"documentId": "BW-SRS-SAMPLE-001", "title": "وثيقة متطلبات الخدمة: طلب تصريح فعالية عامة",
                "preparedBy": "فريق التحليل (مثال)", "documentType": "وثيقة متطلبات", "classification": "داخلي",
                "owner": "الجهة المالكة (مثال)", "issuedOn": "2026-10-27", "version": "V1.0", "status": "مسودة",
                "reviewCycle": "عند كل تعديل على الخدمة"},
    "c1": "المقدمة", "s11": "الغرض من الوثيقة",
    "p11": ["تصف هذه الوثيقة متطلبات خدمة إلكترونية تجريبية تتيح لمقدم الطلب التقدّم بطلب تصريح لإقامة فعالية عامة، ومتابعة حالته حتى صدور القرار.",
            "الوثيقة مثال مجهول الهوية؛ كل الأسماء والأرقام فيها افتراضية."],
    "s12": "نطاق الخدمة",
    "p12": ["يشمل نطاق الخدمة ما يلي:", "• تعبئة نموذج الطلب وإرفاق المستندات المطلوبة.",
            "• دراسة الطلب من الموظف المختص.", "• إصدار القرار وإشعار مقدم الطلب."],
    "c2": "بطاقة الخدمة", "s21": "بيانات الخدمة", "p21": "يبيّن الجدول التالي البيانات الأساسية للخدمة.",
    "t21c": ["البند", "القيمة"],
    "t21": [["اسم الخدمة", "طلب تصريح فعالية عامة"], ["رمز الخدمة", "SRV-000"], ["الفئة المستهدفة", "الأفراد والمنشآت"],
            ["مدة الإنجاز", "خمسة أيام عمل"], ["قناة التقديم", "البوابة الإلكترونية"], ["المخرج", "تصريح إلكتروني بصيغة PDF"]],
    "s22": "الرسوم", "p22": "تُستوفى الرسوم التالية عند تقديم الطلب.",
    "t22c": ["نوع الرسم", "المبلغ", "ملاحظات"],
    "t22": [["رسم دراسة الطلب", "10 دنانير", ""], ["رسم إصدار التصريح", "25 ديناراً", "يُستوفى بعد الموافقة"]],
    "s23": "المرفقات المطلوبة", "t23c": ["المرفق", "إلزامي", "الصيغة"],
    "t23": [["مخطط موقع الفعالية", "نعم", "PDF"], ["خطة السلامة", "نعم", "PDF"], ["موافقة مالك الموقع", "لا", "PDF أو صورة"]],
    "c3": "مخطط سير العمل", "fig": "مخطط سير عمل طلب تصريح فعالية عامة",
    "steps": ["تقديم الطلب", "دراسة الطلب", "إصدار القرار"],
    "c4": "قواعد العمل", "t4c": ["الرمز", "القاعدة"],
    "t4": [["BR-01", "لا يُقبل الطلب قبل إرفاق جميع المرفقات الإلزامية."],
           ["BR-02", "يجب أن يكون تاريخ الفعالية بعد سبعة أيام على الأقل من تاريخ تقديم الطلب."],
           ["BR-03", "يُرسل إشعار إلى مقدم الطلب عند كل تغيير في حالة الطلب."]],
    "c5": "قصص المستخدمين", "s51": "تقديم الطلب", "h51": "مرحلة تقديم الطلب", "lead": "بطاقات القصص",
    "s52": "دراسة الطلب", "h52": "مرحلة دراسة الطلب",
    "us1": story("US-01", "تقديم طلب تصريح", "مقدم الطلب", "تعبئة نموذج الطلب وإرفاق المستندات", "أحصل على تصريح لإقامة الفعالية",
                 ["يظهر النموذج بكل الحقول الإلزامية.", "لا يُرسل الطلب قبل إرفاق المرفقات الإلزامية.", "يظهر رقم الطلب بعد الإرسال."],
                 {"columns": ["الإجراء", "أثره على الطلب"], "rows": [["إرسال", "ينتقل الطلب إلى دراسة الطلب"], ["حفظ كمسودة", "يبقى الطلب لدى مقدم الطلب"]]},
                 {"columns": ["الحقل", "النوع", "إلزامي", "الوصف"],
                  "rows": [["اسم الفعالية", "نص", "نعم", "الاسم المعلن للفعالية"], ["تاريخ الفعالية", "تاريخ", "نعم", "اليوم الأول للفعالية"],
                           ["عدد الحضور المتوقع", "رقم", "نعم", "تقدير عدد الحضور"]]}),
    "us2": story("US-02", "دراسة الطلب", "الموظف المختص", "مراجعة الطلب ومرفقاته", "أتخذ القرار المناسب",
                 ["يرى الموظف كل بيانات الطلب ومرفقاته.", "يستطيع الموظف الموافقة أو الرفض أو الإرجاع للتعديل."],
                 {"columns": ["الإجراء", "أثره على الطلب"],
                  "rows": [["موافقة", "يصدر التصريح"], ["رفض", "يُغلق الطلب ويُشعر مقدم الطلب"], ["إرجاع للتعديل", "يعود الطلب إلى مقدم الطلب"]]}),
}

EN = {
    "rtl": False,
    "control": {"documentId": "BW-SRS-SAMPLE-001", "title": "Service requirements: Public event permit request",
                "preparedBy": "Analysis team (example)", "documentType": "Requirements document", "classification": "Internal",
                "owner": "Owning authority (example)", "issuedOn": "2026-10-27", "version": "V1.0", "status": "Draft",
                "reviewCycle": "On every change to the service"},
    "c1": "Introduction", "s11": "Purpose of this document",
    "p11": ["This document describes the requirements of a sample e-service that lets an applicant request a permit to hold a public event and follow the request until a decision is issued.",
            "The document is an anonymised example; every name and number in it is invented."],
    "s12": "Scope of the service",
    "p12": ["The service covers the following:", "• Filling in the request form and attaching the required documents.",
            "• Review of the request by the responsible officer.", "• Issuing the decision and notifying the applicant."],
    "c2": "Service card", "s21": "Service data", "p21": "The table below lists the basic data of the service.",
    "t21c": ["Item", "Value"],
    "t21": [["Service name", "Public event permit request"], ["Service code", "SRV-000"], ["Audience", "Individuals and organisations"],
            ["Completion time", "Five working days"], ["Channel", "Online portal"], ["Output", "Electronic permit in PDF"]],
    "s22": "Fees", "p22": "The following fees are collected when the request is filed.",
    "t22c": ["Fee", "Amount", "Notes"],
    "t22": [["Review fee", "10 dinars", ""], ["Permit issue fee", "25 dinars", "Collected after approval"]],
    "s23": "Required attachments", "t23c": ["Attachment", "Required", "Format"],
    "t23": [["Event site plan", "Yes", "PDF"], ["Safety plan", "Yes", "PDF"], ["Site owner consent", "No", "PDF or image"]],
    "c3": "Workflow diagram", "fig": "Workflow of the public event permit request",
    "steps": ["File request", "Review request", "Issue decision"],
    "c4": "Business rules", "t4c": ["Code", "Rule"],
    "t4": [["BR-01", "A request is not accepted until every required attachment is uploaded."],
           ["BR-02", "The event date must be at least seven days after the filing date."],
           ["BR-03", "The applicant is notified on every change of the request status."]],
    "c5": "User stories", "s51": "Filing the request", "h51": "Filing stage", "lead": "Story cards",
    "s52": "Reviewing the request", "h52": "Review stage",
    "us1": story("US-01", "File a permit request", "the applicant", "to fill in the request form and attach the documents", "I obtain a permit to hold the event",
                 ["The form shows every required field.", "The request cannot be sent before the required attachments are uploaded.", "The request number is shown after sending."],
                 {"columns": ["Action", "Effect on the request"], "rows": [["Send", "The request moves to review"], ["Save as draft", "The request stays with the applicant"]]},
                 {"columns": ["Field", "Type", "Required", "Description"],
                  "rows": [["Event name", "Text", "Yes", "The announced name of the event"], ["Event date", "Date", "Yes", "The first day of the event"],
                           ["Expected attendance", "Number", "Yes", "Estimated number of attendees"]]}),
    "us2": story("US-02", "Review the request", "the responsible officer", "to review the request and its attachments", "I take the right decision",
                 ["The officer sees all request data and attachments.", "The officer can approve, reject or return the request for changes."],
                 {"columns": ["Action", "Effect on the request"],
                  "rows": [["Approve", "The permit is issued"], ["Reject", "The request is closed and the applicant notified"], ["Return for changes", "The request goes back to the applicant"]]}),
}

for name, t in (("document.ar.json", AR), ("document.en.json", EN)):
    (HERE / name).write_text(json.dumps(doc(t), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("sample written")
