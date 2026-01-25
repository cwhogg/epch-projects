import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getIdeas, saveIdea, deleteIdea } from '@/lib/data';
import { saveIdeaToDb, getIdeasFromDb, isRedisConfigured } from '@/lib/db';
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const idea: ProductIdea = {
      id: uuidv4(),
      name: body.name,
      description: body.description,
      targetUser: body.targetUser,
      problemSolved: body.problemSolved,
      url: body.url || undefined,
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const deleted = deleteIdea(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting idea:', error);
    return NextResponse.json({ error: 'Failed to delete idea' }, { status: 500 });
  }
}
