import { SpeechService } from '../ai/speech.service';

describe('Selected narrator integrity', () => {
  it('does not silently substitute another provider when a selected voice fails', async () => {
    const primary: any = { isConfigured: true, synthesize: jest.fn().mockRejectedValue(new Error('Voice unavailable')) };
    const secondary: any = { isConfigured: true, synthesize: jest.fn() };
    const service = new SpeechService(primary, secondary);
    await expect(service.synthesize({ text: 'A story', voiceId: 'selected' })).rejects.toThrow('Voice unavailable');
    expect(secondary.synthesize).not.toHaveBeenCalled();
  });
  it('reports an unavailable selected narrator before calling a fallback provider', async () => {
    const secondary: any = { isConfigured: true, synthesize: jest.fn() };
    const service = new SpeechService({ isConfigured: false } as any, secondary);
    await expect(service.synthesize({ text: 'A story', voiceId: 'selected' })).rejects.toThrow('selected narrator is unavailable');
    expect(secondary.synthesize).not.toHaveBeenCalled();
  });
});
