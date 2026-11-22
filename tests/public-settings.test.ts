import { describe, expect, it } from 'vitest';
import { parseAdSlot, parseAdsenseClient, parseHttpsUrl, parseVerificationToken, readPublicSettings } from '../src/lib/public-settings';
import { siteConfig } from '../src/site.config';

describe('公開時の設定（環境変数）', () => {
  it('AdSense のパブリッシャー ID', () => {
    expect(parseAdsenseClient('ca-pub-1234567890123456')).toBe('ca-pub-1234567890123456');
    expect(parseAdsenseClient(' pub-1234567890123456 ')).toBe('ca-pub-1234567890123456');
    expect(parseAdsenseClient('')).toBe('');
    expect(() => parseAdsenseClient('1234567890123456')).toThrow('ADSENSE_CLIENT');
    expect(() => parseAdsenseClient('ca-pub-12"><script>')).toThrow('ADSENSE_CLIENT');
  });

  it('広告ユニット ID', () => {
    expect(parseAdSlot('1234567890')).toBe('1234567890');
    expect(parseAdSlot('')).toBe('');
    expect(() => parseAdSlot('slot-1')).toThrow('ADSENSE_SLOT');
  });

  it('URL は https だけ', () => {
    expect(parseHttpsUrl('CONTACT_FORM_URL', 'https://forms.gle/abc')).toBe('https://forms.gle/abc');
    expect(parseHttpsUrl('REPORT_FORM_URL', 'https://docs.google.com/forms/d/e/x/viewform?entry.1={id}')).toContain('{id}');
    expect(parseHttpsUrl('CONTACT_FORM_URL', '')).toBe('');
    expect(() => parseHttpsUrl('CONTACT_FORM_URL', 'http://example.com/')).toThrow('https://');
    expect(() => parseHttpsUrl('CONTACT_FORM_URL', 'javascript:alert(1)')).toThrow('https://');
    expect(() => parseHttpsUrl('CONTACT_FORM_URL', 'forms.gle/abc')).toThrow('URL として読めません');
  });

  it('Search Console の確認用の文字列', () => {
    expect(parseVerificationToken('abcDEF123_-abcDEF123')).toBe('abcDEF123_-abcDEF123');
    expect(() => parseVerificationToken('<meta name="google-site-verification" content="x">')).toThrow('GOOGLE_SITE_VERIFICATION');
  });

  it('環境変数が空なら site.config.ts の値になり、環境変数があればそちらが優先される', () => {
    const s = readPublicSettings({ CONTACT_FORM_URL: '  ', ADSENSE_CLIENT: undefined });
    expect(s.contactFormUrl).toBe(parseHttpsUrl('CONTACT_FORM_URL', siteConfig.contactFormUrl));
    expect(s.adsenseClient).toBe(parseAdsenseClient(siteConfig.adsenseClient));
    expect(s.googleSiteVerification).toBe(parseVerificationToken(siteConfig.googleSiteVerification));
    expect(s.operatorName).toBe(siteConfig.operatorName);
    expect(s.operatorName).not.toBe('');
    expect(readPublicSettings({ CONTACT_FORM_URL: 'https://example.com/form' }).contactFormUrl).toBe('https://example.com/form');
    expect(readPublicSettings({ OPERATOR_NAME: 'テスト' }).operatorName).toBe('テスト');
    expect(readPublicSettings({ ADSENSE_CLIENT: 'pub-1234567890123456', ADSENSE_SLOT: '1234567890' })).toMatchObject({
      adsenseClient: 'ca-pub-1234567890123456',
      adsenseSlot: '1234567890',
    });
  });
});
