import { Injectable } from '@nestjs/common'
import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import FormData from 'form-data'
import config from '../utils/config'

const WHATSAPP_API_URL = `${config.WHATSAPP_API_URL}/${config.PHONE_NUMBER_ID}`
const WHATSAPP_TOKEN = config.ACCESS_TOKEN

interface ReceiptData {
  transactionId: string
  dateTime: string
  senderName: string
  senderPhone: string
  recipientName: string
  recipientPhone: string
  amount: number
  currency: string
  transactionType: 'Send Money' | 'Payment Request'
  fee?: number
}

function getCurrencyIconPath(currency: string): string {
  const iconsDir = path.join(process.cwd(), 'assets', 'currency-icons')

  const iconMap: { [key: string]: string } = {
    XRP: path.join(iconsDir, 'xrp.png'),
    RLUSD: path.join(iconsDir, 'rlusd.png'),
    USDC: path.join(iconsDir, 'usdc.png'),
  }

  return iconMap[currency] || iconMap.XRP
}

function getSendSasaLogoPath(): string {
  return path.join(process.cwd(), 'assets', 'logo', 'sendsasa-logo.png')
}

function imageExists(filepath: string): boolean {
  return fs.existsSync(filepath)
}

export async function generateReceipt(data: ReceiptData): Promise<string> {
  const {
    transactionId,
    dateTime,
    senderName,
    senderPhone,
    recipientName,
    recipientPhone,
    amount,
    currency,
    transactionType,
    fee = 0,
  } = data

  const receiptsDir = path.join(process.cwd(), 'receipts')
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true })
  }

  const filename = `receipt_${transactionId.replaceAll(/[^a-zA-Z0-9]/g, '_')}.pdf`
  const filepath = path.join(receiptsDir, filename)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      })
      const stream = fs.createWriteStream(filepath)

      doc.pipe(stream)

      // Colors
      const primaryColor = '#1A1F71'
      const textColor = '#000000'
      const lightGray = '#F5F5F5'
      const successGreen = '#10B981'

      // Get logo paths
      const sendSasaLogo = getSendSasaLogoPath()
      const currencyIcon = getCurrencyIconPath(currency)
      const hasLogo = imageExists(sendSasaLogo)

      // Header - White background with logos
      doc.rect(0, 0, 595, 70).fill('#FFFFFF')

      // SendSasa Logo (left)
      if (hasLogo) {
        doc.image(sendSasaLogo, 40, 15, { width: 120 })
      } else {
        doc
          .fontSize(24)
          .fillColor(primaryColor)
          .font('Helvetica-Bold')
          .text('SendSasa', 40, 20)

        doc
          .fontSize(9)
          .fillColor('#666666')
          .font('Helvetica')
          .text('Powered by XRPL', 40, 45)
      }

      doc.image(currencyIcon, 520, 18, { width: 35, height: 35 })

      // Title (Compact)
      doc
        .fontSize(18)
        .fillColor(textColor)
        .font('Helvetica-Bold')
        .text('Transaction Receipt', 40, 90)

      // Date and Time
      doc
        .fontSize(9)
        .fillColor('#666666')
        .font('Helvetica')
        .text(dateTime, 40, 112)

      // Transaction Details Box (Optimized spacing)
      const boxTop = 135
      const boxHeight = 215
      doc.rect(40, boxTop, 515, boxHeight).fill(lightGray)

      doc.fillColor(textColor)

      let yPos = boxTop + 15

      // Helper function to add field (Compact)
      const addField = (label: string, value: string, bold = false) => {
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#666666')
          .text(label, 55, yPos)

        doc
          .fontSize(11)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(textColor)
          .text(value, 220, yPos, { width: 320 })

        yPos += 22
      }

      // Add all fields
      addField("Sender's Name:", senderName)
      addField("Sender's Number:", senderPhone)
      addField('Recipient Name:', recipientName)
      addField('Recipient Number:', recipientPhone)

      // Amount (highlighted with icon)
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#666666')
        .text('Amount:', 55, yPos)

      // Currency icon next to amount

      doc.image(currencyIcon, 220, yPos - 2, { width: 18, height: 18 })
      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(`${amount.toLocaleString()} ${currency}`, 243, yPos)

      yPos += 28

      if (fee > 0) {
        addField('Fee:', `${fee.toLocaleString()} ${currency}`)
      }

      addField('Transaction Type:', transactionType)
      addField('Transaction ID:', transactionId.substring(0, 16) + '...')

      // Success indicator
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(successGreen)
        .text('✓ Transaction Successful', 55, yPos + 5)

      // Footer notes (Compact)
      yPos = boxTop + boxHeight + 15
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          'If you need more information about this payment, please contact the sender. Please check your account to confirm you have received this payment.',
          40,
          yPos,
          { align: 'left', width: 515, lineGap: 1 },
        )

      // Disclaimer (Smaller font, more compact)
      yPos = yPos + 32
      doc
        .fontSize(7)
        .font('Helvetica-Bold')
        .fillColor(textColor)
        .text('Disclaimer', 40, yPos)

      doc
        .fontSize(6)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          'Your transaction has been successfully processed. The completion of any transfer is subject to transaction errors, delayed transmission, network fluctuations, or other circumstances beyond the control of SendSasa. All transactions are subject to fraud checks.',
          40,
          yPos + 12,
          { align: 'left', width: 515, lineGap: 0.5 },
        )

      // Bottom branding - Navy background (fits on one page)
      const footerTop = 760
      doc.rect(0, footerTop, 595, 82).fill(primaryColor)

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text('Yours sincerely,', 40, footerTop + 15)

      doc
        .fontSize(9)
        .fillColor('#FFFFFF')
        .text('The SendSasa Team', 40, footerTop + 28)

      // Finalize PDF
      doc.end()

      stream.on('finish', () => {
        console.log(`✅ Receipt generated: ${filepath}`)
        resolve(filepath)
      })

      stream.on('error', (error) => {
        console.error('❌ Error generating receipt:', error)
        reject(error)
      })
    } catch (error) {
      console.error('❌ Error in generateReceipt:', error)
      reject(error)
    }
  })
}

/**
 * Upload receipt PDF to WhatsApp media
 */
export async function uploadReceiptToWhatsApp(
  filepath: string,
): Promise<string> {
  try {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filepath))
    formData.append('type', 'application/pdf')
    formData.append('messaging_product', 'whatsapp')

    const response = await axios.post(`${WHATSAPP_API_URL}/media`, formData, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        ...formData.getHeaders(),
      },
    })

    const mediaId = response.data.id
    console.log(`✅ Receipt uploaded to WhatsApp: ${mediaId}`)
    return mediaId
  } catch (error) {
    console.error('❌ Error uploading receipt to WhatsApp:', error)
    throw error
  }
}

/**
 * Delete receipt file after sending
 */
export async function deleteReceipt(filepath: string): Promise<void> {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
      console.log(`🗑️  Receipt deleted: ${filepath}`)
    }
  } catch (error) {
    console.error('⚠️  Error deleting receipt:', error)
  }
}

/**
 * Generate receipt, upload to WhatsApp, and clean up
 */
export async function generateAndUploadReceipt(
  data: ReceiptData,
): Promise<string> {
  let filepath: string | null = null

  try {
    // Generate PDF
    filepath = await generateReceipt(data)

    // Upload to WhatsApp
    const mediaId = await uploadReceiptToWhatsApp(filepath)

    // Clean up local file
    await deleteReceipt(filepath)

    return mediaId
  } catch (error) {
    // Clean up on error
    if (filepath) {
      await deleteReceipt(filepath)
    }
    throw error
  }
}

@Injectable()
export class ReceiptGeneratorService {
  generateReceipt(data: ReceiptData) { return generateReceipt(data) }
  uploadReceiptToWhatsApp(filepath: string) { return uploadReceiptToWhatsApp(filepath) }
  deleteReceipt(filepath: string) { return deleteReceipt(filepath) }
  generateAndUploadReceipt(data: ReceiptData) { return generateAndUploadReceipt(data) }
}
