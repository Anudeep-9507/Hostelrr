export const DEFAULT_RENT_REMINDER_TEMPLATE = 'Hello {{name}}, your hostel rent of *₹{{amount}}* for Room {{room}} is currently pending.\n\nDue Date: *{{due_date}}*\n\nPlease make the payment soon and reply *PAID* once done.\n\nThank you,\n{{hostel_name}}';

const DEFAULT_REMINDER_SIGNATURE = 'Powered by Hostelrr';
const splitSignature = (template: string) => {
  const lines = template.trimEnd().split('\n');
  const signature = lines[lines.length - 1]?.trim();
  if (signature && /^(?:powered\s+)?by hostelrr$/i.test(signature)) {
    lines.pop();
    return { body: lines.join('\n').trimEnd(), signature };
  }
  return { body: template.trimEnd(), signature: DEFAULT_REMINDER_SIGNATURE };
};

export const getEditableReminderTemplate = (template: string | null | undefined) =>
  splitSignature(template || DEFAULT_RENT_REMINDER_TEMPLATE).body;

export const getReminderSignature = (template: string | null | undefined) =>
  splitSignature(template || DEFAULT_RENT_REMINDER_TEMPLATE).signature;

export function buildRentReminderMessage(
  template: string | null | undefined,
  values: { name: string; amount: string | number; room: string; dueDate: string; hostelName: string },
) {
  const replacements: Record<string, string> = {
    name: values.name,
    amount: String(values.amount),
    room: values.room,
    due_date: values.dueDate,
    hostel_name: values.hostelName,
  };
  const { body: templateBody, signature } = splitSignature(template || DEFAULT_RENT_REMINDER_TEMPLATE);
  const body = templateBody
    .replace(/\{\{\s*(name|amount|room|due_date|hostel_name)\s*\}\}/gi, (_match, key: string) => replacements[key.toLowerCase()])
    .split('\n')
    .join('\n')
    .trim();
  return `${body}\n\n${signature}`;
}
