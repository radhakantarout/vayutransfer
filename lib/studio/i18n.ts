import type { WebsiteLanguage } from '@/types/studio'

// Scope A of the website builder's language support: the studio picks ONE
// display language for their whole site. Only the fixed template chrome (nav
// labels, section headings, booking form, gallery UI copy, footer) is
// translated — the studio's own typed content (about text, service
// descriptions, testimonials, hero copy) is never auto-translated, and stays
// exactly as they wrote it regardless of this setting.
//
// Deliberately a SHARED, generic dictionary rather than per-template bespoke
// translations: each of the 8 (and growing) templates has its own unique
// English phrasing for the same concept ("Let's create something beautiful"
// vs "We'd love to hear your story"), and translating every template's exact
// wording into 5 languages — then doing it again for every future template —
// doesn't scale. English keeps each template's exact original wording,
// unchanged, forever (every existing site is completely unaffected by any of
// this). Non-English languages render from this one dictionary instead —
// slightly more generic phrasing than each template's bespoke English voice,
// but every current and future template gets all 5 languages for free just
// by calling the same translator().
//
// These translations are reasonable, natural short-form business UI phrases,
// but — same caveat as the AI content-assist feature — should get a native
// speaker's review before being treated as fully production-polished.

// Appended to every template's fontFamily stack (see
// app/(studio-site)/layout.tsx, which loads these as CSS variables) so
// Devanagari/Oriya/Bengali/Tamil/Telugu text always has real glyphs
// available, regardless of which language is selected.
export const MULTI_SCRIPT_FONT_FALLBACK =
  'var(--font-noto-devanagari), var(--font-noto-oriya), var(--font-noto-bengali), var(--font-noto-tamil), var(--font-noto-telugu)'

export const LANGUAGE_OPTIONS: { id: WebsiteLanguage; label: string; nativeLabel: string }[] = [
  { id: 'en', label: 'English', nativeLabel: 'English' },
  { id: 'hi', label: 'Hindi',   nativeLabel: 'हिन्दी' },
  { id: 'or', label: 'Odia',    nativeLabel: 'ଓଡ଼ିଆ' },
  { id: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { id: 'ta', label: 'Tamil',   nativeLabel: 'தமிழ்' },
  { id: 'te', label: 'Telugu',  nativeLabel: 'తెలుగు' },
]

type Dict = Record<string, string>

const STRINGS: Record<Exclude<WebsiteLanguage, 'en'>, Dict> = {
  hi: {
    navGallery: 'गैलरी', navAbout: 'हमारे बारे में', navServices: 'सेवाएं', navReviews: 'समीक्षाएं',
    navBook: 'अभी बुक करें', navContact: 'संपर्क करें',
    sectionAboutHeading: 'हमारे बारे में', sectionServicesHeading: 'सेवाएं', sectionReviewsHeading: 'ग्राहकों की राय',
    sectionBookHeadingEnabled: 'सेशन बुक करें', sectionBookHeadingDisabled: 'हमसे संपर्क करें',
    bookingIntro: 'आइए मिलकर कुछ खूबसूरत बनाते हैं',
    viewGallery: 'गैलरी देखें', viewAlbum: 'एल्बम देखें',
    galleryDemoNotice: 'ये नमूना तस्वीरें हैं। अपनी असली पोर्टफोलियो अपलोड करने के लिए डैशबोर्ड → वेबसाइट → गैलरी में जाएं।',
    galleryTapAdvance: 'अगली तस्वीर देखने के लिए टैप करें', galleryPrev: 'पिछला', galleryNext: 'अगला', galleryPieces: 'तस्वीरें',
    galleryScrollNav: 'देखने के लिए स्क्रॉल करें या स्वाइप करें',
    footerPoweredBy: 'द्वारा संचालित',
    formName: 'नाम', formEmail: 'ईमेल', formPhone: 'फ़ोन', formEventType: 'कार्यक्रम प्रकार', formEventDate: 'कार्यक्रम की तारीख',
    formMessage: 'संदेश', formSelectPlaceholder: 'चुनें…', formNamePlaceholder: 'आपका पूरा नाम',
    formMessagePlaceholder: 'अपने कार्यक्रम के बारे में बताएं…', formSubmit: 'पूछताछ भेजें', formSubmitSending: 'भेजा जा रहा है…',
    formThankYouTitle: 'धन्यवाद!', formThankYouBody: 'हमें आपकी पूछताछ मिल गई है और हम जल्द ही आपसे संपर्क करेंगे।',
    formErrName: 'कृपया अपना पूरा नाम दर्ज करें', formErrEmail: 'एक मान्य ईमेल पता दर्ज करें',
    formErrPhone: 'एक मान्य 10-अंकीय भारतीय मोबाइल नंबर दर्ज करें',
    eventWedding: 'शादी', eventPreWedding: 'प्री-वेडिंग', eventEngagement: 'सगाई', eventBirthday: 'जन्मदिन',
    eventCorporate: 'कॉर्पोरेट', eventPortrait: 'पोर्ट्रेट', eventOther: 'अन्य',
    whatsappChat: 'व्हाट्सएप पर चैट करें',
  },
  or: {
    navGallery: 'ଗ୍ୟାଲେରୀ', navAbout: 'ଆମ ବିଷୟରେ', navServices: 'ସେବାସମୂହ', navReviews: 'ସମୀକ୍ଷା',
    navBook: 'ବର୍ତ୍ତମାନ ବୁକ୍ କରନ୍ତୁ', navContact: 'ଯୋଗାଯୋଗ କରନ୍ତୁ',
    sectionAboutHeading: 'ଆମ ବିଷୟରେ', sectionServicesHeading: 'ସେବାସମୂହ', sectionReviewsHeading: 'ଗ୍ରାହକଙ୍କ ମତାମତ',
    sectionBookHeadingEnabled: 'ସେସନ୍ ବୁକ୍ କରନ୍ତୁ', sectionBookHeadingDisabled: 'ଆମ ସହିତ ଯୋଗାଯୋଗ କରନ୍ତୁ',
    bookingIntro: 'ଆସନ୍ତୁ ମିଳିତ ଭାବରେ କିଛି ସୁନ୍ଦର ସୃଷ୍ଟି କରିବା',
    viewGallery: 'ଗ୍ୟାଲେରୀ ଦେଖନ୍ତୁ', viewAlbum: 'ଆଲବମ୍ ଦେଖନ୍ତୁ',
    galleryDemoNotice: 'ଏଗୁଡ଼ିକ ନମୁନା ଫଟୋ। ଆପଣଙ୍କର ପ୍ରକୃତ ପୋର୍ଟଫୋଲିଓ ଅପଲୋଡ୍ କରିବାକୁ ଡ୍ୟାସବୋର୍ଡ → ୱେବସାଇଟ୍ → ଗ୍ୟାଲେରୀକୁ ଯାଆନ୍ତୁ।',
    galleryTapAdvance: 'ପରବର୍ତ୍ତୀ ଫଟୋ ଦେଖିବାକୁ ଟାପ୍ କରନ୍ତୁ', galleryPrev: 'ପୂର୍ବବର୍ତ୍ତୀ', galleryNext: 'ପରବର୍ତ୍ତୀ', galleryPieces: 'ଫଟୋ',
    galleryScrollNav: 'ଦେଖିବାକୁ ସ୍କ୍ରୋଲ୍ କିମ୍ବା ସ୍ୱାଇପ୍ କରନ୍ତୁ',
    footerPoweredBy: 'ଦ୍ୱାରା ପରିଚାଳିତ',
    formName: 'ନାମ', formEmail: 'ଇମେଲ୍', formPhone: 'ଫୋନ୍', formEventType: 'ଇଭେଣ୍ଟ ପ୍ରକାର', formEventDate: 'ଇଭେଣ୍ଟ ତାରିଖ',
    formMessage: 'ବାର୍ତ୍ତା', formSelectPlaceholder: 'ବାଛନ୍ତୁ…', formNamePlaceholder: 'ଆପଣଙ୍କର ପୂର୍ଣ୍ଣ ନାମ',
    formMessagePlaceholder: 'ଆପଣଙ୍କ ଇଭେଣ୍ଟ ବିଷୟରେ କୁହନ୍ତୁ…', formSubmit: 'ଅନୁସନ୍ଧାନ ପଠାନ୍ତୁ', formSubmitSending: 'ପଠାଯାଉଛି…',
    formThankYouTitle: 'ଧନ୍ୟବାଦ!', formThankYouBody: 'ଆମେ ଆପଣଙ୍କର ଅନୁସନ୍ଧାନ ପାଇଛୁ ଏବଂ ଶୀଘ୍ର ଆପଣଙ୍କ ସହିତ ଯୋଗାଯୋଗ କରିବୁ।',
    formErrName: 'ଦୟାକରି ଆପଣଙ୍କର ପୂର୍ଣ୍ଣ ନାମ ଲେଖନ୍ତୁ', formErrEmail: 'ଏକ ବୈଧ ଇମେଲ୍ ଠିକଣା ଲେଖନ୍ତୁ',
    formErrPhone: 'ଏକ ବୈଧ 10-ଅଙ୍କ ବିଶିଷ୍ଟ ଭାରତୀୟ ମୋବାଇଲ୍ ନମ୍ବର ଲେଖନ୍ତୁ',
    eventWedding: 'ବିବାହ', eventPreWedding: 'ପ୍ରି-ୱେଡିଂ', eventEngagement: 'ବାଗଦାନ', eventBirthday: 'ଜନ୍ମଦିନ',
    eventCorporate: 'କର୍ପୋରେଟ୍', eventPortrait: 'ପୋର୍ଟ୍ରେଟ୍', eventOther: 'ଅନ୍ୟାନ୍ୟ',
    whatsappChat: 'ହ୍ୱାଟସଆପ୍‌ରେ ଚାଟ୍ କରନ୍ତୁ',
  },
  bn: {
    navGallery: 'গ্যালারি', navAbout: 'আমাদের সম্পর্কে', navServices: 'পরিষেবা', navReviews: 'পর্যালোচনা',
    navBook: 'এখনই বুক করুন', navContact: 'যোগাযোগ করুন',
    sectionAboutHeading: 'আমাদের সম্পর্কে', sectionServicesHeading: 'পরিষেবা', sectionReviewsHeading: 'গ্রাহকদের মতামত',
    sectionBookHeadingEnabled: 'সেশন বুক করুন', sectionBookHeadingDisabled: 'আমাদের সাথে যোগাযোগ করুন',
    bookingIntro: 'আসুন একসাথে কিছু সুন্দর তৈরি করি',
    viewGallery: 'গ্যালারি দেখুন', viewAlbum: 'অ্যালবাম দেখুন',
    galleryDemoNotice: 'এগুলো নমুনা ছবি। আপনার আসল পোর্টফোলিও আপলোড করতে ড্যাশবোর্ড → ওয়েবসাইট → গ্যালারিতে যান।',
    galleryTapAdvance: 'পরবর্তী ছবি দেখতে ট্যাপ করুন', galleryPrev: 'পূর্ববর্তী', galleryNext: 'পরবর্তী', galleryPieces: 'ছবি',
    galleryScrollNav: 'দেখতে স্ক্রল বা সোয়াইপ করুন',
    footerPoweredBy: 'দ্বারা পরিচালিত',
    formName: 'নাম', formEmail: 'ইমেইল', formPhone: 'ফোন', formEventType: 'ইভেন্টের ধরন', formEventDate: 'ইভেন্টের তারিখ',
    formMessage: 'বার্তা', formSelectPlaceholder: 'নির্বাচন করুন…', formNamePlaceholder: 'আপনার পুরো নাম',
    formMessagePlaceholder: 'আপনার অনুষ্ঠান সম্পর্কে বলুন…', formSubmit: 'অনুসন্ধান পাঠান', formSubmitSending: 'পাঠানো হচ্ছে…',
    formThankYouTitle: 'ধন্যবাদ!', formThankYouBody: 'আমরা আপনার অনুসন্ধান পেয়েছি এবং শীঘ্রই আপনার সাথে যোগাযোগ করব।',
    formErrName: 'অনুগ্রহ করে আপনার পুরো নাম লিখুন', formErrEmail: 'একটি বৈধ ইমেইল ঠিকানা লিখুন',
    formErrPhone: 'একটি বৈধ ১০-সংখ্যার ভারতীয় মোবাইল নম্বর লিখুন',
    eventWedding: 'বিয়ে', eventPreWedding: 'প্রি-ওয়েডিং', eventEngagement: 'বাগদান', eventBirthday: 'জন্মদিন',
    eventCorporate: 'কর্পোরেট', eventPortrait: 'পোর্ট্রেট', eventOther: 'অন্যান্য',
    whatsappChat: 'হোয়াটসঅ্যাপে চ্যাট করুন',
  },
  ta: {
    navGallery: 'கேலரி', navAbout: 'எங்களைப் பற்றி', navServices: 'சேவைகள்', navReviews: 'விமர்சனங்கள்',
    navBook: 'இப்போது முன்பதிவு செய்யுங்கள்', navContact: 'தொடர்பு கொள்ளுங்கள்',
    sectionAboutHeading: 'எங்களைப் பற்றி', sectionServicesHeading: 'சேவைகள்', sectionReviewsHeading: 'வாடிக்கையாளர் கருத்துகள்',
    sectionBookHeadingEnabled: 'அமர்வை முன்பதிவு செய்யுங்கள்', sectionBookHeadingDisabled: 'எங்களை தொடர்பு கொள்ளுங்கள்',
    bookingIntro: 'இணைந்து ஒரு அழகான தருணத்தை உருவாக்குவோம்',
    viewGallery: 'கேலரியைக் காண்க', viewAlbum: 'ஆல்பத்தைக் காண்க',
    galleryDemoNotice: 'இவை மாதிரி புகைப்படங்கள். உங்கள் உண்மையான போர்ட்ஃபோலியோவை பதிவேற்ற டாஷ்போர்டு → வலைத்தளம் → கேலரிக்குச் செல்லவும்.',
    galleryTapAdvance: 'அடுத்த புகைப்படத்தைக் காண தட்டவும்', galleryPrev: 'முந்தைய', galleryNext: 'அடுத்தது', galleryPieces: 'புகைப்படங்கள்',
    galleryScrollNav: 'பார்க்க ஸ்க்ரோல் செய்யவும் அல்லது ஸ்வைப் செய்யவும்',
    footerPoweredBy: 'மூலம்',
    formName: 'பெயர்', formEmail: 'மின்னஞ்சல்', formPhone: 'தொலைபேசி', formEventType: 'நிகழ்வு வகை', formEventDate: 'நிகழ்வு தேதி',
    formMessage: 'செய்தி', formSelectPlaceholder: 'தேர்ந்தெடுக்கவும்…', formNamePlaceholder: 'உங்கள் முழுப் பெயர்',
    formMessagePlaceholder: 'உங்கள் நிகழ்வைப் பற்றி எங்களிடம் கூறுங்கள்…', formSubmit: 'விசாரணையை அனுப்பவும்', formSubmitSending: 'அனுப்பப்படுகிறது…',
    formThankYouTitle: 'நன்றி!', formThankYouBody: 'உங்கள் விசாரணையைப் பெற்றோம், விரைவில் உங்களைத் தொடர்பு கொள்வோம்.',
    formErrName: 'உங்கள் முழுப் பெயரை உள்ளிடவும்', formErrEmail: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்',
    formErrPhone: 'சரியான 10-இலக்க இந்திய மொபைல் எண்ணை உள்ளிடவும்',
    eventWedding: 'திருமணம்', eventPreWedding: 'முன் திருமணம்', eventEngagement: 'நிச்சயதார்த்தம்', eventBirthday: 'பிறந்தநாள்',
    eventCorporate: 'கார்ப்பரேட்', eventPortrait: 'போர்ட்ரெய்ட்', eventOther: 'மற்றவை',
    whatsappChat: 'வாட்ஸ்அப்பில் அரட்டையடிக்க',
  },
  te: {
    navGallery: 'గ్యాలరీ', navAbout: 'మా గురించి', navServices: 'సేవలు', navReviews: 'సమీక్షలు',
    navBook: 'ఇప్పుడే బుక్ చేయండి', navContact: 'సంప్రదించండి',
    sectionAboutHeading: 'మా గురించి', sectionServicesHeading: 'సేవలు', sectionReviewsHeading: 'క్లయింట్ల అభిప్రాయాలు',
    sectionBookHeadingEnabled: 'సెషన్ బుక్ చేయండి', sectionBookHeadingDisabled: 'మమ్మల్ని సంప్రదించండి',
    bookingIntro: 'కలిసి అందమైనదాన్ని సృష్టిద్దాం',
    viewGallery: 'గ్యాలరీ చూడండి', viewAlbum: 'ఆల్బమ్ చూడండి',
    galleryDemoNotice: 'ఇవి నమూనా ఫోటోలు. మీ నిజమైన పోర్ట్‌ఫోలియోను అప్‌లోడ్ చేయడానికి డాష్‌బోర్డ్ → వెబ్‌సైట్ → గ్యాలరీకి వెళ్లండి.',
    galleryTapAdvance: 'తదుపరి ఫోటో చూడటానికి నొక్కండి', galleryPrev: 'మునుపటి', galleryNext: 'తదుపరి', galleryPieces: 'ఫోటోలు',
    galleryScrollNav: 'చూడటానికి స్క్రోల్ చేయండి లేదా స్వైప్ చేయండి',
    footerPoweredBy: 'ద్వారా',
    formName: 'పేరు', formEmail: 'ఇమెయిల్', formPhone: 'ఫోన్', formEventType: 'ఈవెంట్ రకం', formEventDate: 'ఈవెంట్ తేదీ',
    formMessage: 'సందేశం', formSelectPlaceholder: 'ఎంచుకోండి…', formNamePlaceholder: 'మీ పూర్తి పేరు',
    formMessagePlaceholder: 'మీ ఈవెంట్ గురించి మాకు చెప్పండి…', formSubmit: 'విచారణ పంపండి', formSubmitSending: 'పంపుతోంది…',
    formThankYouTitle: 'ధన్యవాదాలు!', formThankYouBody: 'మీ విచారణ మాకు అందింది, మేము త్వరలో మిమ్మల్ని సంప్రదిస్తాము.',
    formErrName: 'దయచేసి మీ పూర్తి పేరు నమోదు చేయండి', formErrEmail: 'చెల్లుబాటు అయ్యే ఇమెయిల్ చిరునామాను నమోదు చేయండి',
    formErrPhone: 'చెల్లుబాటు అయ్యే 10-అంకెల భారతీయ మొబైల్ నంబర్‌ను నమోదు చేయండి',
    eventWedding: 'వివాహం', eventPreWedding: 'ప్రీ-వెడ్డింగ్', eventEngagement: 'నిశ్చితార్థం', eventBirthday: 'పుట్టినరోజు',
    eventCorporate: 'కార్పొరేట్', eventPortrait: 'పోర్ట్రెయిట్', eventOther: 'ఇతర',
    whatsappChat: 'వాట్సాప్‌లో చాట్ చేయండి',
  },
}

// `fallback` is always the caller's own current English string — for
// English (undefined/'en') this is returned completely untouched, which is
// what makes every existing site's rendering provably unaffected by this
// feature ever having been added.
export function translator(language: WebsiteLanguage | undefined) {
  return (key: string, fallback: string): string => {
    if (!language || language === 'en') return fallback
    return STRINGS[language]?.[key] ?? fallback
  }
}
