import { Injectable, PipeTransform } from '@nestjs/common'
import { normalizeToE164 } from '@shared/phone-number.service'

@Injectable()
export class ParsePhonePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value
    return normalizeToE164(value) ?? value
  }
}
