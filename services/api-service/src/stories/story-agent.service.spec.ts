import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StoryAgentService } from './story-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { SpeechService } from '../ai/speech.service';

describe('StoryAgentService', () => {
  let service: StoryAgentService;

  /** Two chapters, so the spoiler guard has something to withhold. */
  const story = {
    id: 'story-1',
    title: 'Bramble and the Puddle',
    synopsis: null,
    agentGuidance: null,
    narratorVoiceId: null,
    characters: [{ name: 'Bramble', description: 'a small hedgehog' }],
    chapters: [
      {
        id: 'ch-1',
        segments: [
          { id: 'seg-1', text: 'Bramble met a wide puddle.' },
          { id: 'seg-2', text: 'She jumped, and landed with a splash.' },
        ],
      },
      {
        id: 'ch-2',
        segments: [
          { id: 'seg-3', text: 'At the end, Bramble found a bridge.' },
        ],
      },
    ],
  };

  const mockPrisma: any = {
    storyRelease: { findFirst: jest.fn().mockResolvedValue(null) },
    story: { findUnique: jest.fn() },
    storyConversation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    storyTurn: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
  };

  const mockGemini: any = {
    converse: jest.fn().mockResolvedValue('She jumped and got wet!'),
    transcribe: jest.fn(),
  };
  const mockSpeech: any = {
    synthesize: jest
      .fn()
      .mockResolvedValue({ audio: Buffer.from('a'), mimeType: 'audio/mpeg' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoryAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
        { provide: SpeechService, useValue: mockSpeech },
      ],
    }).compile();

    service = module.get(StoryAgentService);
    jest.clearAllMocks();

    mockPrisma.story.findUnique.mockResolvedValue(story);
    mockPrisma.storyConversation.create.mockResolvedValue({ id: 'conv-1' });
    mockPrisma.storyConversation.update.mockResolvedValue({});
    mockPrisma.storyTurn.findMany.mockResolvedValue([]);
    mockPrisma.storyTurn.count.mockResolvedValue(0);
    mockPrisma.storyTurn.create.mockResolvedValue({});
    mockGemini.converse.mockResolvedValue('She jumped and got wet!');
    mockSpeech.synthesize.mockResolvedValue({
      audio: Buffer.from('a'),
      mimeType: 'audio/mpeg',
    });
  });

  const askDemo = (over: any = {}) =>
    service.ask({
      storyId: 'story-1',
      studentProfileId: null,
      demoSessionId: 'visitor-1',
      text: 'Why did she get wet?',
      ...over,
    });

  describe('grounding', () => {
    it('rejects a page outside the story before processing a recorded question', async () => {
      mockGemini.transcribe.mockResolvedValue('What happens next?');
      await expect(
        askDemo({
          segmentId: 'page-from-another-story',
          text: undefined,
          audio: { buffer: Buffer.from('pcm'), mimeType: 'audio/webm' },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockGemini.transcribe).not.toHaveBeenCalled();
      expect(mockGemini.converse).not.toHaveBeenCalled();
      expect(mockSpeech.synthesize).not.toHaveBeenCalled();
      expect(mockPrisma.storyConversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.storyTurn.create).not.toHaveBeenCalled();
    });

    it('withholds everything past the segment the child has reached', async () => {
      await askDemo({ segmentId: 'seg-1' });

      const { systemInstruction } = mockGemini.converse.mock.calls[0][0];
      expect(systemInstruction).toContain('Bramble met a wide puddle.');
      // The spoiler guard: a child on the first page asking "what happens?"
      // must not be told, and an agent handed the ending simply tells them.
      expect(systemInstruction).not.toContain('found a bridge');
      expect(systemInstruction).not.toContain('landed with a splash');
    });

    it('includes the whole story when no position is given', async () => {
      await askDemo();

      const { systemInstruction } = mockGemini.converse.mock.calls[0][0];
      expect(systemInstruction).toContain('found a bridge');
    });

    it('tells the model to refuse anything outside the story', async () => {
      await askDemo({ segmentId: 'seg-2' });

      const { systemInstruction } = mockGemini.converse.mock.calls[0][0];
      expect(systemInstruction).toContain('Answer only from the STORY SO FAR');
      expect(systemInstruction).toContain('Never invent events');
    });
  });

  describe('demo caps', () => {
    it('refuses once the conversation has had its turns', async () => {
      mockPrisma.storyConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        storyId: 'story-1',
        demoSessionId: 'visitor-1',
        studentProfileId: null,
        isDemo: true,
      });
      // Eight is the per-conversation ceiling. This has to come from a count,
      // not from the history list: the history query is capped at six, so a
      // cap derived from its length could never reach eight and never fired.
      mockPrisma.storyTurn.count.mockResolvedValue(8);
      mockPrisma.storyTurn.findMany.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({
          sortOrder: i + 1,
          childText: 'q',
          replyText: 'a',
        })),
      );

      await expect(askDemo({ conversationId: 'conv-1' })).rejects.toThrow(
        ForbiddenException,
      );
      // The refusal must land before the paid call, not after it.
      expect(mockGemini.converse).not.toHaveBeenCalled();
    });

    it('numbers a new turn past every existing one, not past the window', async () => {
      mockPrisma.storyConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        storyId: 'story-1',
        demoSessionId: 'visitor-1',
        studentProfileId: null,
        isDemo: true,
      });
      // Seven turns exist but only six come back as history.
      mockPrisma.storyTurn.count.mockResolvedValue(7);
      mockPrisma.storyTurn.findMany.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({
          sortOrder: i + 2,
          childText: 'q',
          replyText: 'a',
        })),
      );

      await askDemo({ conversationId: 'conv-1' });

      // sortOrder is unique per conversation; taking it from the truncated
      // history would reuse position 7 and violate the constraint.
      expect(mockPrisma.storyTurn.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 8 }),
        }),
      );
    });

    it('creates no conversation when the model call fails', async () => {
      mockGemini.converse.mockRejectedValue(new Error('rate limited'));

      await expect(askDemo()).rejects.toThrow('rate limited');

      // An empty conversation per failed attempt is not just litter: the
      // client only learns its id from a successful reply, so each retry would
      // start a fresh one and hand the visitor a fresh allowance.
      expect(mockPrisma.storyConversation.create).not.toHaveBeenCalled();
    });

    it('refuses once the day-wide ceiling is reached', async () => {
      mockPrisma.storyTurn.count.mockResolvedValue(300);

      await expect(askDemo()).rejects.toThrow(ForbiddenException);
      // Checked before the story is even loaded — a script hammering this
      // should cost one indexed count, not a model call.
      expect(mockGemini.converse).not.toHaveBeenCalled();
      expect(mockSpeech.synthesize).not.toHaveBeenCalled();
    });

    it('does not cap a signed-in child', async () => {
      mockPrisma.storyTurn.count.mockResolvedValue(9999);

      const reply = await service.ask({
        storyId: 'story-1',
        studentProfileId: 'student-1',
        demoSessionId: null,
        text: 'Why did she get wet?',
      });

      expect(reply.replyText).toBe('She jumped and got wet!');
      expect(reply.turnsRemaining).toBeNull();
    });
  });

  describe('conversation ownership', () => {
    it('refuses to continue a conversation belonging to another visitor', async () => {
      mockPrisma.storyConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        storyId: 'story-1',
        demoSessionId: 'someone-else',
        studentProfileId: null,
        isDemo: true,
      });

      // A conversation id is a bearer token for a transcript; guessing one must
      // not read another child's questions.
      await expect(askDemo({ conversationId: 'conv-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('degradation', () => {
    it('still answers when the voice fails', async () => {
      mockSpeech.synthesize.mockRejectedValue(new Error('quota exhausted'));

      const reply = await askDemo();

      // Losing the voice should cost the audio, not the answer.
      expect(reply.replyText).toBe('She jumped and got wet!');
      expect(reply.replyAudio).toBeNull();
      expect(mockPrisma.storyTurn.create).toHaveBeenCalled();
    });

    it('transcribes audio before answering', async () => {
      mockGemini.transcribe.mockResolvedValue('  Why is she wet?  ');

      const reply = await askDemo({
        text: undefined,
        audio: { buffer: Buffer.from('pcm'), mimeType: 'audio/webm' },
      });

      expect(reply.childText).toBe('Why is she wet?');
      expect(mockGemini.converse.mock.calls[0][0].userText).toBe(
        'Why is she wet?',
      );
    });
  });
});
