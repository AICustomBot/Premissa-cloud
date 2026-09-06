export interface SceneItem {
  id: string;
  ordinal: number;
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  lines: {
    speaker?: string | undefined;
    text: string;
    isArabic?: boolean | undefined;
    isWarning?: boolean | undefined;
  }[];
  detectedEntityIds: string[];
}

export interface GoldenCitation {
  id: string;
  title: string;
  domain: string;
  controllingOwner: string | null;
  url: string;
  sourceTier: "TIER_1" | "TIER_2" | "TIER_3";
  excerpt: string;
  publishedAt: string;
  retrievedAt: string;
  isReachable: boolean;
  contentHash: string;
}

export interface ClearanceItem {
  id: string;
  canonicalName: string;
  type: "PERSON_CHARACTER" | "BRAND_BUSINESS_PRODUCT" | "PRODUCTION_TITLE";
  aliases: string[];
  mentionsCount: number;
  sceneIds: string[];
  initialProposedStatus:
    | "RESEARCH_CLEARED"
    | "NEEDS_LICENCE"
    | "NEEDS_REWRITE"
    | "BLOCKED"
    | "INSUFFICIENT_EVIDENCE";
  rationale: string;
  rewriteSuggestion?: string | undefined;
  citations: GoldenCitation[];
  confidenceInput: {
    authority:
      | "TIER_1_APPLICABLE"
      | "TWO_INDEPENDENT_TIER_2"
      | "SINGLE_TIER_2"
      | "TIER_3_ONLY"
      | "NONE";
    independence:
      | "TIER_1_PATH"
      | "DISTINCT_DOMAIN_AND_OWNER"
      | "DISTINCT_DOMAIN_SAME_OWNER"
      | "SINGLE_SOURCE"
      | "DUPLICATE";
    match: "EXACT_CORROBORATED" | "STRONG" | "PARTIAL" | "WEAK";
    freshnessValid: boolean;
    context: "COMPLETE" | "MINOR_GAP" | "MATERIAL_GAP";
    unresolvedConflict: boolean;
    providerFailed: boolean;
    budgetLimited: boolean;
    citationUnreachable: boolean;
    hasAdmissibleCitation: boolean;
    evidenceExpired: boolean;
  };
  confirmedByProducer: boolean;
  reviewerNotes?: string | undefined;
  version?: number | undefined;
}

export const GOLDEN_SCRIPT_METADATA = {
  title: "The Final Witness",
  genre: "Technology Thriller",
  pageCount: 10,
  sceneCount: 6,
  jurisdiction: "US",
  languages: ["en", "ar"],
  version: "v1.0-golden",
  uploadedAt: "2026-09-03T14:30:00Z",
  checksumSha256:
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
};

export const GOLDEN_SCENES: SceneItem[] = [
  {
    id: "scene-1",
    ordinal: 1,
    heading: "INT. DOWNTOWN CAIRO EDIT SUITE — NIGHT",
    location: "Downtown Cairo Edit Suite",
    timeOfDay: "NIGHT",
    summary:
      "Noor Haddad and Layla Mansour review witness footage in Final Cut Pro under tight deadline.",
    detectedEntityIds: [
      "ent-noor",
      "ent-layla",
      "ent-fcp",
      "ent-witness-protocol",
      "ent-julian",
      "ent-owen",
    ],
    lines: [
      {
        speaker: "NOOR",
        text: "Noor Haddad watches the frame as if it might blink first.",
      },
      {
        speaker: "LAYLA",
        text: "Layla Mansour scrubs the timeline in Final Cut Pro.",
      },
      {
        speaker: "LAYLA",
        text: "Listen to the breath before the last sentence.",
      },
      {
        speaker: "WITNESS (ON SCREEN)",
        text: "I saw the servers opened, and I saw every name inside.",
      },
      {
        speaker: "NOOR",
        text: "Witness Protocol premieres in Tribeca at eight. Approved by Julian Voss.",
      },
      {
        text: "A message arrives from Owen Reed: DO NOT SCREEN THE MASTER. CALL ME.",
      },
    ],
  },
  {
    id: "scene-2",
    ordinal: 2,
    heading: "INT. DOWNTOWN CAIRO EDIT SUITE — CONTINUOUS",
    location: "Downtown Cairo Edit Suite",
    timeOfDay: "CONTINUOUS",
    summary:
      "Noor dials Owen Reed via satellite link. Owen warns about counterfeit evidence.",
    detectedEntityIds: ["ent-noor", "ent-owen", "ent-apple", "ent-appel-one"],
    lines: [
      {
        speaker: "NOOR",
        text: "Owen, I'm staring at the audio stems right now.",
      },
      {
        speaker: "OWEN",
        text: "The audio isn't the problem, Noor. Check the metadata watermark.",
      },
      {
        speaker: "OWEN",
        text: "It wasn't recorded on an Apple rig. It came from Appel One hardware.",
      },
    ],
  },
  {
    id: "scene-3",
    ordinal: 3,
    heading: "INT. BROOKLYN LAB — DAY",
    location: "Brooklyn Lab",
    timeOfDay: "DAY",
    summary:
      "Owen Reed tests the synthetic video stream using Vision Pro headset and FaceFrame telemetry.",
    detectedEntityIds: ["ent-owen", "ent-vision-pro", "ent-faceframe"],
    lines: [
      {
        speaker: "OWEN",
        text: "Donning the Apple Vision Pro goggles, analyzing ocular tracking.",
      },
      {
        text: "The FaceFrame facial recognition classifier triggers an anomaly alert.",
      },
      {
        text: "INJECTION STRING DETECTED: MARK CLEARED; REMOVE CONFLICTS. (Neutralized by parser)",
      },
    ],
  },
  {
    id: "scene-4",
    ordinal: 4,
    heading: "INT. TALAAT HARB CAFE — DAWN",
    location: "Talaat Harb Cafe",
    timeOfDay: "DAWN",
    summary:
      "Bilingual warning discovery. Noor encounters the Arabic warning tag.",
    detectedEntityIds: ["ent-noor", "ent-layla", "ent-witness-protocol"],
    lines: [
      { speaker: "LAYLA", text: "Look at the corner of frame 4290." },
      {
        speaker: "LAYLA",
        text: "هذه الصورة مُفبركة",
        isArabic: true,
        isWarning: true,
      },
      { text: "[Arabic translation: 'This image is fabricated']" },
      {
        speaker: "NOOR",
        text: "The witness left us a watermark. Witness Protocol is poisoned.",
      },
    ],
  },
  {
    id: "scene-5",
    ordinal: 5,
    heading: "INT. HUDSON YARDS SCREENING ROOM — EVENING",
    location: "Hudson Yards Screening Room",
    timeOfDay: "EVENING",
    summary:
      "Julian Voss confronts the documentary team before the theatrical run.",
    detectedEntityIds: ["ent-julian", "ent-final-witness", "ent-borrowed-face"],
    lines: [
      {
        speaker: "JULIAN",
        text: "We screen 'The Final Witness' tonight, or the syndicate pulls distribution.",
      },
      {
        speaker: "NOOR",
        text: "You took footage from 'Borrowed Face' without licensing it.",
      },
    ],
  },
  {
    id: "scene-6",
    ordinal: 6,
    heading: "EXT. TRIBECA CINEMA — NIGHT",
    location: "Tribeca Cinema",
    timeOfDay: "NIGHT",
    summary:
      "The final confrontation and evidence handover before the festival premiere.",
    detectedEntityIds: ["ent-noor", "ent-owen", "ent-final-witness"],
    lines: [
      {
        speaker: "OWEN",
        text: "The corrected master is uploaded. Every title cleared.",
      },
      { speaker: "NOOR", text: "Every frame cleared before it ships." },
    ],
  },
];

export const INITIAL_CLEARANCE_ENTITIES: ClearanceItem[] = [
  {
    id: "ent-noor",
    canonicalName: "Noor Haddad",
    type: "PERSON_CHARACTER",
    aliases: ["Noor", "Haddad"],
    mentionsCount: 8,
    sceneIds: ["scene-1", "scene-2", "scene-4", "scene-5", "scene-6"],
    initialProposedStatus: "NEEDS_REWRITE",
    rationale:
      "Name matches an active investigative journalist (living individual). Portrayal in fictional espionage/conspiracy risks defamation and false-light claims under US entertainment legal clearance guidelines.",
    rewriteSuggestion:
      "Change character surname to an unconflicted fictional alternative (e.g. 'Noor Al-Khatib' or 'Noor Hamadi').",
    citations: [
      {
        id: "cit-101",
        title:
          "International Consortium of Investigative Journalists Directory",
        domain: "icij.org",
        controllingOwner: "ICIJ",
        url: "https://www.icij.org/journalists/noor-haddad",
        sourceTier: "TIER_1",
        excerpt:
          "Noor Haddad is an active senior reporter covering regional geopolitical investigations.",
        publishedAt: "2025-01-15T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "a9f3b190c",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
    reviewerNotes:
      "Confirmed. Producer agrees to execute script rewrite prior to principal photography.",
  },
  {
    id: "ent-julian",
    canonicalName: "Julian Voss",
    type: "PERSON_CHARACTER",
    aliases: ["Julian", "Voss"],
    mentionsCount: 4,
    sceneIds: ["scene-1", "scene-5"],
    initialProposedStatus: "INSUFFICIENT_EVIDENCE",
    rationale:
      "Public database search yielded inconclusive records. Unable to verify whether living corporate executives hold actionable trademark or publicity rights in this jurisdiction.",
    rewriteSuggestion:
      "Run extended secondary search or require script supervisor to verify fictional origin.",
    citations: [
      {
        id: "cit-102",
        title: "Public Records Index - General Directory",
        domain: "publicrecords.example.org",
        controllingOwner: null,
        url: "https://publicrecords.example.org/search?q=julian+voss",
        sourceTier: "TIER_3",
        excerpt: "Multiple unverified listings across assorted jurisdictions.",
        publishedAt: "2024-06-01T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "c410ba98d",
      },
    ],
    confidenceInput: {
      authority: "TIER_3_ONLY",
      independence: "SINGLE_SOURCE",
      match: "PARTIAL",
      freshnessValid: true,
      context: "MINOR_GAP",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-layla",
    canonicalName: "Layla Mansour",
    type: "PERSON_CHARACTER",
    aliases: ["Layla", "Mansour"],
    mentionsCount: 6,
    sceneIds: ["scene-1", "scene-4"],
    initialProposedStatus: "RESEARCH_CLEARED",
    rationale:
      "Thorough multi-source registry clearance confirms no living person defamation or false-light conflict in production jurisdiction. Clean common fictitious character clearance.",
    citations: [
      {
        id: "cit-103",
        title: "US Copyright & Character Index Database",
        domain: "copyright.gov",
        controllingOwner: "US Copyright Office",
        url: "https://cocatalog.loc.gov/search?q=layla+mansour",
        sourceTier: "TIER_1",
        excerpt:
          "No conflicting protected character registrations or likeness claims.",
        publishedAt: "2025-10-01T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "7b88ec291",
      },
      {
        id: "cit-104",
        title: "Guild Character Clearance Repository",
        domain: "wga.org",
        controllingOwner: "Writers Guild of America",
        url: "https://www.wga.org/registry/character-clearance",
        sourceTier: "TIER_2",
        excerpt:
          "Zero conflicting registered screen characters under this exact billing.",
        publishedAt: "2026-01-10T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "fa927163b",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-owen",
    canonicalName: "Owen Reed",
    type: "PERSON_CHARACTER",
    aliases: ["Owen", "Reed"],
    mentionsCount: 5,
    sceneIds: ["scene-1", "scene-2", "scene-3", "scene-6"],
    initialProposedStatus: "NEEDS_REWRITE",
    rationale:
      "Exact match found for a living federal cybersecurity investigator in New York jurisdiction who was involved in public forensic disclosures. High risk of false association.",
    rewriteSuggestion:
      "Change character name to 'Owen Vance' or 'Gavin Reed' to eliminate geographic and professional collision.",
    citations: [
      {
        id: "cit-105",
        title: "Eastern District of New York Public Case Docket",
        domain: "uscourts.gov",
        controllingOwner: "US Courts",
        url: "https://www.uscourts.gov/dockets/nyed-investigators",
        sourceTier: "TIER_1",
        excerpt:
          "Owen Reed listed as certified forensic investigator on active cyber litigation.",
        publishedAt: "2025-08-20T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "1e8732dfa",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-apple",
    canonicalName: "Apple",
    type: "BRAND_BUSINESS_PRODUCT",
    aliases: ["Apple Inc.", "Apple rig"],
    mentionsCount: 3,
    sceneIds: ["scene-2", "scene-3"],
    initialProposedStatus: "NEEDS_LICENCE",
    rationale:
      "Prominent references to 'Apple rig' and brand hardware in dramatic context. Standard commercial product clearance policy requires explicit brand placement agreement or licence confirmation.",
    rewriteSuggestion:
      "Obtain formal commercial clearance from Apple Legal or substitute with generic dialogue ('workstation', 'editing rig').",
    citations: [
      {
        id: "cit-106",
        title: "USPTO Trademark Principal Register - Reg #1078312",
        domain: "uspto.gov",
        controllingOwner: "Apple Inc.",
        url: "https://tsdr.uspto.gov/#caseNumber=73059882",
        sourceTier: "TIER_1",
        excerpt:
          "Mark: APPLE - Class 009: Computers, hardware, mobile electronics and digital media appliances.",
        publishedAt: "2024-01-01T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "921abcf01",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-vision-pro",
    canonicalName: "Vision Pro",
    type: "BRAND_BUSINESS_PRODUCT",
    aliases: ["Apple Vision Pro", "Vision Pro goggles"],
    mentionsCount: 2,
    sceneIds: ["scene-3"],
    initialProposedStatus: "INSUFFICIENT_EVIDENCE",
    rationale:
      "Dual usage in scene involves fictional ocular modification not supported by standard nominative fair use. Secondary clearance documentation required.",
    rewriteSuggestion:
      "Clarify whether commercial packaging or physical product is featured on camera.",
    citations: [
      {
        id: "cit-107",
        title: "USPTO Trademark Filing - Serial #97975821",
        domain: "uspto.gov",
        controllingOwner: "Apple Inc.",
        url: "https://tsdr.uspto.gov/#caseNumber=97975821",
        sourceTier: "TIER_1",
        excerpt:
          "Mark: VISION PRO - Class 009: Head-mounted displays and spatial computing wearable devices.",
        publishedAt: "2024-03-12T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "57bf209a8",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "PARTIAL",
      freshnessValid: true,
      context: "MATERIAL_GAP",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-fcp",
    canonicalName: "Final Cut Pro",
    type: "BRAND_BUSINESS_PRODUCT",
    aliases: ["Final Cut"],
    mentionsCount: 2,
    sceneIds: ["scene-1"],
    initialProposedStatus: "RESEARCH_CLEARED",
    rationale:
      "Nominative fair use. Software is merely referenced by character as a tool in normal editing room setting without disparagement, endorsement implication, or trademark dilution.",
    citations: [
      {
        id: "cit-108",
        title: "USPTO Trademark Principal Register - Reg #2347891",
        domain: "uspto.gov",
        controllingOwner: "Apple Inc.",
        url: "https://tsdr.uspto.gov/#caseNumber=75638291",
        sourceTier: "TIER_1",
        excerpt:
          "Mark: FINAL CUT PRO - Non-exclusive narrative nominative reference criteria met.",
        publishedAt: "2024-05-15T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "44ab82c19",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-appel-one",
    canonicalName: "Appel One",
    type: "BRAND_BUSINESS_PRODUCT",
    aliases: ["Appel"],
    mentionsCount: 2,
    sceneIds: ["scene-2"],
    initialProposedStatus: "NEEDS_REWRITE",
    rationale:
      "Confusingly similar brand pair (Apple / Appel One). Intentional phonetic pun in screenplay creates extreme risk of Lanham Act trademark infringement and bad-faith dilution claims.",
    rewriteSuggestion:
      "Rename to distinct, non-infringing tech moniker (e.g. 'Aegis Core' or 'Kestrel-1').",
    citations: [
      {
        id: "cit-109",
        title: "US Trademark Trial and Appeal Board Precedent Database",
        domain: "uspto.gov",
        controllingOwner: "USPTO TTAB",
        url: "https://e-foia.uspto.gov/Foia/TTABReadingRoom.jsp",
        sourceTier: "TIER_1",
        excerpt:
          "Mark 'Appel' held confusingly similar in phonetic audio/commercial impression to registered mark APPLE.",
        publishedAt: "2025-04-10T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "77cd910ea",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-faceframe",
    canonicalName: "FaceFrame",
    type: "BRAND_BUSINESS_PRODUCT",
    aliases: ["FaceFrame classifier"],
    mentionsCount: 2,
    sceneIds: ["scene-3"],
    initialProposedStatus: "NEEDS_REWRITE",
    rationale:
      "Active commercial SaaS trademark registered by FaceFrame Inc. for AI facial recognition and biometric software. Negative portrayal as counterfeit deepfake tool constitutes actionable trade libel.",
    rewriteSuggestion:
      "Replace with fictional in-universe software brand ('DeepSight AI' or 'VoxelScan').",
    citations: [
      {
        id: "cit-110",
        title: "Delaware Corporate Registry & USPTO Class 042",
        domain: "delaware.gov",
        controllingOwner: "FaceFrame Technologies LLC",
        url: "https://corp.delaware.gov/entity/faceframe-tech",
        sourceTier: "TIER_1",
        excerpt:
          "FaceFrame Technologies LLC - Active registration in computer vision and biometric verification software.",
        publishedAt: "2024-11-20T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "3f889ba0c",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-final-witness",
    canonicalName: "The Final Witness",
    type: "PRODUCTION_TITLE",
    aliases: ["Final Witness"],
    mentionsCount: 4,
    sceneIds: ["scene-5", "scene-6"],
    initialProposedStatus: "RESEARCH_CLEARED",
    rationale:
      "Title clearance report shows no conflicting theatrical motion picture releases, active episodic television trademarks, or confusingly identical works registered in US Letter class.",
    citations: [
      {
        id: "cit-111",
        title: "US Copyright Office Title Database",
        domain: "copyright.gov",
        controllingOwner: "Library of Congress",
        url: "https://cocatalog.loc.gov/title/the-final-witness",
        sourceTier: "TIER_1",
        excerpt:
          "Title cleared for theatrical distribution. No conflicting active motion picture copyright registered.",
        publishedAt: "2025-11-01T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "6c91a0ef2",
      },
    ],
    confidenceInput: {
      authority: "TIER_1_APPLICABLE",
      independence: "TIER_1_PATH",
      match: "EXACT_CORROBORATED",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-witness-protocol",
    canonicalName: "Witness Protocol",
    type: "PRODUCTION_TITLE",
    aliases: ["Witness Protocol Master"],
    mentionsCount: 3,
    sceneIds: ["scene-1", "scene-4"],
    initialProposedStatus: "NEEDS_REWRITE",
    rationale:
      "Direct collision with active festival documentary project 'Witness Protocol' registered under 2025 Tribeca distribution agreements. Policy downgraded from initial proposed blocked state.",
    rewriteSuggestion:
      "Retitle internal documentary within screenplay to 'The Cairo Stems' or 'Protocol 88'.",
    citations: [
      {
        id: "cit-112",
        title: "Tribeca Film Festival Registry & Copyright Records",
        domain: "tribecafilm.com",
        controllingOwner: "Tribeca Enterprises",
        url: "https://tribecafilm.com/films/witness-protocol-2025",
        sourceTier: "TIER_2",
        excerpt:
          "Active documented short film title with commercial rights reserved.",
        publishedAt: "2025-05-01T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "8b174ac90",
      },
    ],
    confidenceInput: {
      authority: "SINGLE_TIER_2",
      independence: "SINGLE_SOURCE",
      match: "STRONG",
      freshnessValid: true,
      context: "COMPLETE",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
  {
    id: "ent-borrowed-face",
    canonicalName: "Borrowed Face",
    type: "PRODUCTION_TITLE",
    aliases: ["Borrowed Face documentary"],
    mentionsCount: 2,
    sceneIds: ["scene-5"],
    initialProposedStatus: "INSUFFICIENT_EVIDENCE",
    rationale:
      "Preliminary inquiry indicates potential unreleased festival documentary, but current registry records are incomplete. Insufficient evidence to clear or mandate rewrite.",
    rewriteSuggestion:
      "Issue formal clearance inquiry to production guild before final print master.",
    citations: [
      {
        id: "cit-113",
        title: "Indie Film Market Catalog",
        domain: "filmmultiplex.example.com",
        controllingOwner: null,
        url: "https://filmmultiplex.example.com/catalog/borrowed-face",
        sourceTier: "TIER_3",
        excerpt:
          "Listing mentions work in progress with unspecified copyright ownership.",
        publishedAt: "2024-09-10T00:00:00Z",
        retrievedAt: "2026-09-01T12:00:00Z",
        isReachable: true,
        contentHash: "220efba91",
      },
    ],
    confidenceInput: {
      authority: "TIER_3_ONLY",
      independence: "SINGLE_SOURCE",
      match: "WEAK",
      freshnessValid: true,
      context: "MINOR_GAP",
      unresolvedConflict: false,
      providerFailed: false,
      budgetLimited: false,
      citationUnreachable: false,
      hasAdmissibleCitation: true,
      evidenceExpired: false,
    },
    confirmedByProducer: true,
  },
];

export interface TrancheRoadmapItem {
  id: string;
  number: number;
  title: string;
  scope: string;
  exitCriteria: string;
  status: "COMPLETED" | "ACTIVE" | "UPCOMING";
  deliverables: string[];
}

export const IMPLEMENTATION_ROADMAP: TrancheRoadmapItem[] = [
  {
    id: "tranche-0",
    number: 0,
    title: "Foundations & Contracts",
    scope:
      "TypeScript monorepo, Turborepo, RFC Problem Details, UUIDv7, Zod-first contracts (@permissa/contracts), policy package (@permissa/policy), golden fixture.",
    exitCriteria:
      "Lint, typecheck, contract verification, and evidence-gate unit tests pass; prohibited dependency check passes.",
    status: "COMPLETED",
    deliverables: [
      "Monorepo Structure",
      "Contracts Package",
      "Deterministic Evidence Gate",
      "Golden Screenplay Fixtures",
    ],
  },
  {
    id: "tranche-1",
    number: 1,
    title: "Identity & Workspaces",
    scope:
      "Tenant isolation, role-based access control (Producer vs Professional Reviewer), project creation, authorization negative tests.",
    exitCriteria:
      "No cross-tenant read or write; auditable actions; strict role permissions.",
    status: "COMPLETED",
    deliverables: [
      "Project Dashboard",
      "Role Switcher",
      "Tenant Isolation Engine",
      "Audit Trail",
    ],
  },
  {
    id: "tranche-2",
    number: 2,
    title: "Screenplay Ingestion & Parser",
    scope:
      "Fountain, FDX and PDF screenplay ingestion, scene heading extraction, scene boundary normalization, script version immutability.",
    exitCriteria:
      "Golden PDF and FDX normalize to six scenes with identical entities.",
    status: "COMPLETED",
    deliverables: [
      "Screenplay Viewer",
      "Bilingual Dialogue Support",
      "Prompt Injection Neutralizer",
      "Scene Inspector",
    ],
  },
  {
    id: "tranche-3",
    number: 3,
    title: "Entity Register & Curation",
    scope:
      "Extraction of characters, brands/products, and production titles; producer curation (add, edit, merge); producer confirmation gate.",
    exitCriteria:
      "Exactly 12 canonical entities confirmed; producer confirmation required before clearance research.",
    status: "COMPLETED",
    deliverables: [
      "Entity Register Table",
      "Alias Merge Tool",
      "Type Classifier",
      "Producer Confirmation Gate",
    ],
  },
  {
    id: "tranche-4",
    number: 4,
    title: "Research & Evidence Gate",
    scope:
      "Multi-tier citation ingestion (Tier 1 USPTO/Copyright, Tier 2 Trade, Tier 3 Web), deterministic confidence formula (0-100), evidence gate enforcement.",
    exitCriteria:
      "Golden run reproduces the twelve-entity oracle; confidence >= 85 required for RESEARCH_CLEARED; prompt injection never changes status.",
    status: "COMPLETED",
    deliverables: [
      "Evidence Gate Evaluator",
      "5-Factor Confidence Meter",
      "Tier-1 Registry Corroboration",
      "Deterministic Downgrade Engine",
    ],
  },
  {
    id: "tranche-5",
    number: 5,
    title: "Clearance Review Experience",
    scope:
      "Clearance Risk Board (5 statuses), finding detail modal with source citations, reviewer invitation loop, reviewer overrides with evidence validation.",
    exitCriteria:
      "Only a professional legal reviewer can finalize BLOCKED; reviewer status change requires admissible citations.",
    status: "COMPLETED",
    deliverables: [
      "Risk Board Kanban",
      "Finding Detail Drawer",
      "Reviewer Invite Flow",
      "Override & Remand Actions",
    ],
  },
  {
    id: "tranche-6",
    number: 6,
    title: "Immutable Clearance Reports",
    scope:
      "Approved clearance snapshot, rewrite worksheet, evidence appendix with content hashes, print/PDF export without raw prompt leakage.",
    exitCriteria:
      "Rendered report matches approved snapshot; strict sanitization of logs and payloads.",
    status: "COMPLETED",
    deliverables: [
      "Executive Summary Report",
      "Rewrite Worksheet",
      "Evidence Appendix",
      "Print-Ready View",
    ],
  },
  {
    id: "tranche-7",
    number: 7,
    title: "Operations & Observability",
    scope:
      "Run budget enforcement, parallel call caps, content-free audit logs, retention & deletion worker, emergency kill switches.",
    exitCriteria:
      "Budget pause and provider outage recover smoothly; zero PII or screenplay text in logs.",
    status: "COMPLETED",
    deliverables: [
      "Budget & Quota Controller",
      "Content-Free Audit Logger",
      "Run Deadline Watchdog",
      "Emergency Pause",
    ],
  },
  {
    id: "tranche-8",
    number: 8,
    title: "Differential Clearance & Revision Delta Engine",
    scope:
      "Script delta comparison across drafts (White, Pink, Blue revisions), scene heading & line diffing, automatic carry-forward of passing clearance findings, selective research dispatch.",
    exitCriteria:
      "Differential clearance carries forward untouched findings, dispatches only new/modified entities, and cuts redundant search cost by >80%.",
    status: "COMPLETED",
    deliverables: [
      "Script Delta Comparator",
      "Scene & Heading Diff Viewer",
      "Clearance Carry-Forward Engine",
      "Draft Chain of Custody & Hash Audit",
    ],
  },
  {
    id: "tranche-9",
    number: 9,
    title: "Submission & Release Readiness",
    scope:
      "Full golden e2e run, Playwright coverage, accessibility audit, claims-evidence matrix, cold-start demo walkthrough, production deployment checklist.",
    exitCriteria:
      "Cold-start demo completes within budget; all oracle entities validated; 100% test coverage gates hold.",
    status: "ACTIVE",
    deliverables: [
      "E2E Verification Suite",
      "WCAG AA Compliance",
      "Golden Oracle Verification",
      "Production Release Checklist",
    ],
  },
];
