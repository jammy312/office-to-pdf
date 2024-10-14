import type { VercelRequest, VercelResponse } from '@vercel/node'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  return Response.json({
    message: `Hello ${name}!`,
  })
}
