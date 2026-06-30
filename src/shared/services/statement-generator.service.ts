import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { LocalTransfer } from '@features/kobokall/kobokall-remittance.schema'
import { Deal } from '@features/trustlock/deal.schema'
import { GroupMember } from '@features/njangi/group-member.schema'
import { Group } from '@features/njangi/group.schema'
import { Payroll } from '@features/payday/payroll.schema'
import { Invoice } from '@features/safipay/invoice.schema'
import { uploadReceiptToWhatsApp, deleteReceipt } from './receipt-generator.service'
import { sendDocumentByMediaId, sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import logger from '@common/utils/logger'

const NAVY = '#1A1F71'
const WHITE = '#FFFFFF'
const LIGHT_GRAY = '#F4F4F4'
const MID_GRAY = '#888888'
const TEXT = '#1A1A1A'
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 40
const COL_W = PAGE_W - MARGIN * 2
const FOOTER_H = 36
const HEADER_H = 72

interface StatementRow {
  date: string
  type: string
  description: string
  amount: number
  direction: 'credit' | 'debit'
  status: string
}

interface StatementSection {
  title: string
  rows: StatementRow[]
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

async function collectSections(
  phone: string,
  fromDate: Date,
  toDate: Date,
): Promise<StatementSection[]> {
  const toEnd = new Date(toDate)
  toEnd.setHours(23, 59, 59, 999)

  const [momoTxns, deals, memberships, payrolls, employeePayrolls, invoices] =
    await Promise.all([
      LocalTransfer.find({
        $or: [{ senderPhone: phone }, { recipientPhone: phone }],
        createdAt: { $gte: fromDate, $lte: toEnd },
        status: 'COMPLETED',
      })
        .sort({ createdAt: -1 })
        .lean(),

      Deal.find({
        $or: [{ buyerPhone: phone }, { sellerPhone: phone }],
        completedAt: { $gte: fromDate, $lte: toEnd },
        status: { $in: ['COMPLETED', 'REFUNDED'] },
      })
        .sort({ completedAt: -1 })
        .lean(),

      GroupMember.find({
        phone,
        paidAt: { $gte: fromDate, $lte: toEnd },
      })
        .sort({ paidAt: -1 })
        .lean(),

      Payroll.find({
        employerPhone: phone,
        createdAt: { $gte: fromDate, $lte: toEnd },
        status: { $in: ['COMPLETED', 'PARTIAL_FAILURE'] },
      })
        .sort({ createdAt: -1 })
        .lean(),

      Payroll.find({
        'items.recipientPhone': phone,
        'items.status': 'COMPLETED',
      })
        .sort({ createdAt: -1 })
        .lean(),

      Invoice.find({
        $or: [{ merchantPhone: phone }, { clientPhone: phone }],
        paidAt: { $gte: fromDate, $lte: toEnd },
        status: 'PAID',
      })
        .sort({ paidAt: -1 })
        .lean(),
    ])

  const sections: StatementSection[] = []

  if ((momoTxns as any[]).length > 0) {
    sections.push({
      title: 'MoMo Transfers (KoboKall)',
      rows: (momoTxns as any[]).map((t) => ({
        date: fmtDate(t.createdAt),
        type: 'MoMo Transfer',
        description:
          t.senderPhone === phone ? `To ${t.recipientPhone}` : `From ${t.senderPhone}`,
        amount: t.senderPhone === phone ? t.amount : t.netAmount,
        direction: t.senderPhone === phone ? 'debit' : 'credit',
        status: 'Completed',
      })),
    })
  }

  if ((deals as any[]).length > 0) {
    sections.push({
      title: 'Escrow Deals (TrustLock)',
      rows: (deals as any[]).map((d) => ({
        date: fmtDate(d.completedAt),
        type: d.status === 'REFUNDED' ? 'Refund' : 'Escrow',
        description: d.title,
        amount: d.buyerPhone === phone ? d.amount : d.amountToSeller,
        direction:
          d.status === 'REFUNDED' ? 'credit' : d.buyerPhone === phone ? 'debit' : 'credit',
        status: d.status === 'REFUNDED' ? 'Refunded' : 'Completed',
      })),
    })
  }

  if ((memberships as any[]).length > 0) {
    const groupIds = [...new Set((memberships as any[]).map((m) => String(m.groupId)))]
    const groups = await Group.find({ _id: { $in: groupIds } }).lean()
    const groupMap = Object.fromEntries((groups as any[]).map((g) => [String(g._id), g]))
    sections.push({
      title: 'Group Savings (Njangi / SplitChat)',
      rows: (memberships as any[]).map((m) => {
        const g = groupMap[String(m.groupId)] as any
        return {
          date: fmtDate(m.paidAt),
          type: g?.type === 'SPLITCHAT' ? 'SplitChat' : 'Njangi',
          description: g?.name ?? 'Group contribution',
          amount: g?.contributionAmount ?? 0,
          direction: 'debit' as const,
          status: 'Contributed',
        }
      }),
    })
  }

  if ((payrolls as any[]).length > 0) {
    sections.push({
      title: 'Payroll Disbursements (PayDay)',
      rows: (payrolls as any[]).map((p) => ({
        date: fmtDate(p.createdAt),
        type: 'Payroll',
        description: `${p.name} (${p.paidCount}/${p.recipientCount} paid)`,
        amount: p.totalAmount,
        direction: 'debit' as const,
        status: p.status === 'PARTIAL_FAILURE' ? 'Partial' : 'Completed',
      })),
    })
  }

  const employeeRows: StatementRow[] = []
  for (const p of employeePayrolls as any[]) {
    for (const item of p.items ?? []) {
      if (
        item.recipientPhone === phone &&
        item.status === 'COMPLETED' &&
        item.paidAt &&
        new Date(item.paidAt) >= fromDate &&
        new Date(item.paidAt) <= toEnd
      ) {
        employeeRows.push({
          date: fmtDate(item.paidAt),
          type: 'Salary',
          description: `${p.name}${item.recipientName ? ' — ' + item.recipientName : ''}`,
          amount: item.amount,
          direction: 'credit',
          status: 'Received',
        })
      }
    }
  }
  if (employeeRows.length > 0) {
    sections.push({ title: 'Salary Received (PayDay)', rows: employeeRows })
  }

  if ((invoices as any[]).length > 0) {
    sections.push({
      title: 'Invoices (SafiPay)',
      rows: (invoices as any[]).map((inv) => ({
        date: fmtDate(inv.paidAt),
        type: 'Invoice',
        description: inv.description,
        amount: inv.total,
        direction: inv.merchantPhone === phone ? 'credit' : 'debit',
        status: 'Paid',
      })),
    })
  }

  return sections
}

async function buildPDF(
  phone: string,
  fromDate: Date,
  toDate: Date,
  sections: StatementSection[],
): Promise<string> {
  const receiptsDir = path.join(process.cwd(), 'receipts')
  if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true })
  const filepath = path.join(
    receiptsDir,
    `statement-${phone.replace(/\+/g, '')}-${Date.now()}.pdf`,
  )

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
  const writeStream = fs.createWriteStream(filepath)
  doc.pipe(writeStream)

  const rangeLabel = `${fmtDate(fromDate)} – ${fmtDate(toDate)}`
  let totalCredit = 0
  let totalDebit = 0
  let totalCount = 0
  for (const sec of sections) {
    for (const r of sec.rows) {
      if (r.direction === 'credit') totalCredit += r.amount
      else totalDebit += r.amount
      totalCount++
    }
  }

  const drawHeader = () => {
    const top = doc.page.margins.top !== undefined ? 0 : 0
    doc.save()
    doc.rect(0, top, PAGE_W, HEADER_H).fill(NAVY)
    doc.fontSize(16).font('Helvetica-Bold').fillColor(WHITE).text('SendSasa', MARGIN, 20)
    doc.fontSize(10).font('Helvetica').fillColor('#AAAAFF').text('Transaction Statement', MARGIN + 100, 24)
    doc.fontSize(9).font('Helvetica').fillColor('#CCCCFF').text(`${phone}   ·   ${rangeLabel}`, MARGIN, 46)
    doc.restore()
  }

  const drawSummary = (y: number): number => {
    doc.rect(MARGIN, y, COL_W, 50).fill(LIGHT_GRAY)
    const col = COL_W / 3
    const items = [
      { label: 'TOTAL CREDITED', value: `+${totalCredit.toLocaleString()} XAF`, color: '#10B981' },
      { label: 'TOTAL DEBITED', value: `-${totalDebit.toLocaleString()} XAF`, color: '#EF4444' },
      { label: 'TRANSACTIONS', value: String(totalCount), color: TEXT },
    ]
    items.forEach(({ label, value, color }, i) => {
      const x = MARGIN + col * i + 12
      doc.fontSize(7).font('Helvetica').fillColor(MID_GRAY).text(label, x, y + 10, { width: col - 12 })
      doc.fontSize(11).font('Helvetica-Bold').fillColor(color).text(value, x, y + 22, { width: col - 12 })
    })
    return y + 58
  }

  // Column layout: Date | Type | Description | Amount | Status
  const cols = [
    MARGIN,
    MARGIN + COL_W * 0.15,
    MARGIN + COL_W * 0.29,
    MARGIN + COL_W * 0.67,
    MARGIN + COL_W * 0.84,
  ]
  const colWidths = [COL_W * 0.14, COL_W * 0.13, COL_W * 0.37, COL_W * 0.16, COL_W * 0.15]

  const drawTableHeader = (y: number): number => {
    doc.rect(MARGIN, y, COL_W, 18).fill('#E0E0EE')
    const headers = ['DATE', 'TYPE', 'DESCRIPTION', 'AMOUNT (XAF)', 'STATUS']
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#555588')
    headers.forEach((h, i) => doc.text(h, cols[i] + 3, y + 5, { width: colWidths[i] }))
    return y + 18
  }

  const ROW_H = 20
  const SECTION_HEAD_H = 22
  const SAFE_BOTTOM = PAGE_H - FOOTER_H - 8

  const ensureSpace = (y: number, needed: number): number => {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage()
      drawHeader()
      return HEADER_H + 12
    }
    return y
  }

  drawHeader()
  let y = HEADER_H + 12
  y = drawSummary(y)

  if (sections.length === 0) {
    doc.fontSize(13).font('Helvetica').fillColor(MID_GRAY)
      .text('No transactions found for this period.', MARGIN, y + 80, {
        width: COL_W,
        align: 'center',
      })
  }

  for (const section of sections) {
    y = ensureSpace(y, SECTION_HEAD_H + 18 + ROW_H)
    doc.rect(MARGIN, y, COL_W, SECTION_HEAD_H).fill('#DDEEFF')
    doc.fontSize(8).font('Helvetica-Bold').fillColor(NAVY)
      .text(section.title.toUpperCase(), MARGIN + 6, y + 7, { width: COL_W - 12 })
    y += SECTION_HEAD_H
    y = drawTableHeader(y)

    section.rows.forEach((row, i) => {
      y = ensureSpace(y, ROW_H)
      doc.rect(MARGIN, y, COL_W, ROW_H).fill(i % 2 === 0 ? WHITE : LIGHT_GRAY)
      doc.fontSize(7).font('Helvetica').fillColor(TEXT)
        .text(row.date, cols[0] + 3, y + 6, { width: colWidths[0] })
        .text(row.type, cols[1] + 3, y + 6, { width: colWidths[1] })
        .text(row.description, cols[2] + 3, y + 6, { width: colWidths[2], ellipsis: true })
      doc.fontSize(7).font('Helvetica-Bold')
        .fillColor(row.direction === 'credit' ? '#10B981' : '#EF4444')
        .text(
          `${row.direction === 'credit' ? '+' : '-'}${row.amount.toLocaleString()}`,
          cols[3] + 3,
          y + 6,
          { width: colWidths[3] },
        )
      doc.fontSize(7).font('Helvetica').fillColor(MID_GRAY)
        .text(row.status, cols[4] + 3, y + 6, { width: colWidths[4] })
      y += ROW_H
    })

    y += 10
  }

  // Draw footers on all pages
  const pageCount = doc.bufferedPageRange().count
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i)
    const fy = PAGE_H - FOOTER_H
    doc.rect(0, fy, PAGE_W, FOOTER_H).fill(NAVY)
    doc.fontSize(8).font('Helvetica').fillColor(WHITE)
      .text('Powered by SendSasa · sendsasa.com', MARGIN, fy + 13, { width: COL_W / 2 })
    doc.text(`Page ${i + 1} of ${pageCount}`, MARGIN + COL_W / 2, fy + 13, {
      width: COL_W / 2,
      align: 'right',
    })
  }

  doc.end()

  return new Promise<string>((resolve, reject) => {
    writeStream.on('finish', () => resolve(filepath))
    writeStream.on('error', reject)
  })
}

export async function generateAndSendStatement(
  phone: string,
  fromDate: Date,
  toDate: Date,
): Promise<void> {
  try {
    await sendTextMessage(phone, `⏳ *Generating your statement…*\n\nThis may take a few seconds.`)

    const sections = await collectSections(phone, fromDate, toDate)
    const totalRows = sections.reduce((s, sec) => s + sec.rows.length, 0)

    if (totalRows === 0) {
      await sendTextMessage(
        phone,
        `📄 No transactions found between ${fmtDate(fromDate)} and ${fmtDate(toDate)}.`,
      )
      return
    }

    const filepath = await buildPDF(phone, fromDate, toDate, sections)
    const mediaId = await uploadReceiptToWhatsApp(filepath)
    await sendDocumentByMediaId(
      phone,
      mediaId,
      `SendSasa-Statement-${fmtDate(fromDate)}-to-${fmtDate(toDate)}.pdf`,
      `📄 Your statement · ${fmtDate(fromDate)} – ${fmtDate(toDate)} · ${totalRows} transaction${totalRows !== 1 ? 's' : ''}`,
    )
    await deleteReceipt(filepath)

    logger.info(`[Statement] Sent to ${phone}: ${totalRows} transactions`)
  } catch (err: any) {
    logger.error(`[Statement] Failed for ${phone}: ${err?.message ?? err}`)
    await sendTextMessage(
      phone,
      '❌ Could not generate your statement. Please try again later.',
    ).catch(() => {})
  }
}
