export const translations = {
  en: {
    // Navigation
    home: "Home",
    bookings: "Bookings",
    profile: "Profile",
    settings: "Settings",
    nav_discovery: "Discovery",
    nav_bookings: "My Trips",
    profile_garage: "Profile & Garage",
    
    // Station Detail
    stationDetail: "Station Details",
    amenities: "Amenities",
    operatingHours: "Operating Hours",
    allConnectorsOccupied: "All connectors occupied",
    joinWaitlist: "Join Waitlist",
    nextAvailable: "Next available: ~{mins} min",
    alreadyInWaitlist: "Already in waitlist",
    waitlistPosition: "Position in queue: {pos}",
    
    // Charging
    activeSession: "Active Session",
    energyDelivered: "Energy Delivered",
    elapsedTime: "Elapsed",
    cost: "Cost",
    endSession: "End Charging Session",
    
    // Profile & Loyalty
    garage: "Garage",
    loyaltyProgram: "Loyalty Program",
    bronzeTier: "Bronze Member",
    silverTier: "Silver Member",
    goldTier: "Gold Member",
    pointsToNextTier: "{points} pts to next tier",
    carbonSavings: "Carbon Savings",
    treesSaved: "Trees Saved",
    
    // Common
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    confirm: "Confirm"
  },
  hi: {
    // Navigation
    home: "मुख्य पृष्ठ",
    bookings: "बुकिंग",
    profile: "प्रोफ़ाइल",
    settings: "सेटिङ्ग्स",
    nav_discovery: "तलाश",
    nav_bookings: "मेरी यात्राएं",
    profile_garage: "प्रोफ़ाइल और गैरेज",
    
    // Station Detail
    stationDetail: "स्टेशन का विवरण",
    amenities: "सुविधाएं",
    operatingHours: "कार्य समय",
    allConnectorsOccupied: "सभी कनेक्टर व्यस्त हैं",
    joinWaitlist: "वेटलिस्ट में शामिल हों",
    nextAvailable: "अगली उपलब्धता: ~{mins} मिनट",
    alreadyInWaitlist: "आप पहले से वेटलिस्ट में हैं",
    waitlistPosition: "लाइन में स्थिति: {pos}",
    
    // Charging
    activeSession: "सक्रिय सत्र",
    energyDelivered: "दी गई ऊर्जा",
    elapsedTime: "बीता समय",
    cost: "लागत",
    endSession: "चार्जिंग समाप्त करें",
    
    // Profile & Loyalty
    garage: "गैरेज",
    loyaltyProgram: "लॉयल्टी प्रोग्राम",
    bronzeTier: "ब्रोंज मेंबर",
    silverTier: "सिल्वर मेंबर",
    goldTier: "गोल्ड मेंबर",
    pointsToNextTier: "अगले स्तर के लिए {points} अंक",
    carbonSavings: "कार्बन बचत",
    treesSaved: "बचाए गए पेड़",
    
    // Common
    loading: "लोड हो रहा है...",
    error: "त्रुटि",
    success: "सफलता",
    cancel: "रद्द करें",
    confirm: "पुष्टि करें"
  }
};

export type Language = "en" | "hi";
export type TranslationKey = keyof typeof translations.en;
