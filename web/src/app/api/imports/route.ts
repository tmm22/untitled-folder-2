import { NextResponse } from 'next/server';
import { fetchReadableContent } from '@/lib/imports/fetcher';
import { summariseText } from '@/lib/pipelines/openai';

interface ImportRequestBody {
  url?: string;
}

export async function POST(request: Request) {
  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
  }

  try {
    const { title, content } = await fetchReadableContent(rawUrl);

    if (!content) {
      return NextResponse.json({ error: 'No readable content found' }, { status: 422 });
    }

    const summary = await summariseText(content);

    return NextResponse.json({
      title,
      content,
      summary,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Import failed', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}
