import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getIdeas, saveIdea, deleteIdea } from '@/lib/data';
import { saveIdeaToDb, getIdeasFromDb, getIdeaFromDb, deleteIdeaFromDb, isRedisConfigured } from '@/lib/db';
import { ProductIdea } from '@/types';

export async function GET() {
  try {
    // Use database if configured, otherwise fall back to file system
    if (isRedisConfigured()) {
      const ideas = await getIdeasFromDb();
      return NextResponse.json(ideas);
    }
    const ideas = getIdeas();
    return NextResponse.json(ideas);
  } catch (error) {
    console.error('Error getting ideas:', error);
    return NextResponse.json({ error: 'Failed to get ideas' }, { status: 500 });
  }
}

// Normalize URL - add https:// if no protocol specified
function normalizeUrl(url: string | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.match(/^https?:\/\//i)) return trimmed;
  return `https://${trimmed}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const idea: ProductIdea = {
      id: uuidv4(),
      name: body.name,
      description: body.description,
      targetUser: body.targetUser,
      problemSolved: body.problemSolved,
      url: normalizeUrl(body.url),
      githubRepo: body.githubRepo || undefined,
      documentContent: body.documentContent || undefined,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    // Save to database if configured
    if (isRedisConfigured()) {
      await saveIdeaToDb(idea);
    } else {
      // Fall back to file system for local dev
      saveIdea(idea);
    }

    return NextResponse.json(idea, { status: 201 });
  } catch (error) {
    console.error('Error saving idea:', error);
    return NextResponse.json({ error: 'Failed to save idea' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (!isRedisConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const idea = await getIdeaFromDb(id);
    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    const body = await request.json();

    // Only allow updating specific fields
    if (body.name !== undefined) idea.name = body.name;
    if (body.description !== undefined) idea.description = body.description;
    if (body.targetUser !== undefined) idea.targetUser = body.targetUser;
    if (body.problemSolved !== undefined) idea.problemSolved = body.problemSolved;
    if (body.url !== undefined) idea.url = normalizeUrl(body.url);

    await saveIdeaToDb(idea);
    return NextResponse.json(idea);
  } catch (error) {
    console.error('Error updating idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    let deleted: boolean;
    if (isRedisConfigured()) {
      deleted = await deleteIdeaFromDb(id);
    } else {
      deleted = deleteIdea(id);
    }

    if (!deleted) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting idea:', error);
    return NextResponse.json({ error: 'Failed to delete idea' }, { status: 500 });
  }
}
