import { auth } from '@/src/auth';
import { getWorkflows } from '@/src/workflows/loader';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getWorkflows());
}
