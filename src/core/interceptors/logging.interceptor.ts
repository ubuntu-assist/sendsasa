import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { tap } from 'rxjs/operators'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const start = Date.now()
    const handler = context.getHandler().name
    const cls = context.getClass().name
    return next
      .handle()
      .pipe(tap(() => console.log(`[${cls}.${handler}] ${Date.now() - start}ms`)))
  }
}
