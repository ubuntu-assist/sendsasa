import { v2 as cloudinary } from 'cloudinary'
import config from '@common/utils/config'

cloudinary.config({ secure: true, url: config.CLOUDINARY_URL })

export async function uploadFromUrl(sourceUrl: string, folder = 'dispute-evidence'): Promise<string> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder,
    resource_type: 'image',
    overwrite: false,
  })
  return result.secure_url
}
