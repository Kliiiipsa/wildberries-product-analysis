import { NextResponse } from 'next/server';
import { getModelStatus } from '@/lib/groq-client';

export async function GET() {
  return NextResponse.json({ models: getModelStatus() });
}
