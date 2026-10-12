export const germanToEnglish: Record<string, string> = {
  /*
   * Fuel.
   *
   * Diesel was missing entirely and the plug-in hybrid key was spelled
   * "Plug-In-Hybrid" where FINN sends "Plug-in Hybrid" — so both mapped to
   * undefined, and every diesel and every plug-in hybrid came out of the API
   * with no powertrain at all. That silently reached three places: the
   * environmental assessment couldn't say what the car burned, the cost
   * estimate billed diesel at the petrol price, and the plug-in hybrid caveat
   * never fired for the cars it exists for.
   *
   * Both spellings of the hybrid are kept, because a live API is not worth
   * betting a powertrain on.
   */
  Benzin: "Petrol",
  Diesel: "Diesel",
  Elektro: "Electric",
  "Plug-in Hybrid": "Plug-in Hybrid",
  "Plug-In-Hybrid": "Plug-in Hybrid",
  "Plug-in-Hybrid": "Plug-in Hybrid",

  // transmission
  Automatik: "Automatic",
  Manuell: "Manual",
  Schaltgetriebe: "Manual",

  // drivetrain
  Frontantrieb: "Front-Wheel Drive",
  Hinterradantrieb: "Rear-Wheel Drive",
  Allradantrieb: "All-Wheel Drive",

  // vehicle type
  "Klein- und Kompaktwagen": "Small & Compact Cars",

  // exterior
  "LED-Scheinwerfer": "LED Headlights",
  Nebelscheinwerfer: "Fog Lights",
  "Matrix-LED-Scheinwerfer": "Matrix LED Headlights",
  "Schiebedach / Panoramadach / Glasdach": "Sunroof / Panoramic Roof / Glass Roof",
  Anhängerkupplung: "Tow Hitch",
  "Privacy-Glas": "Privacy Glass",
  Dachreling: "Roof Rails",
  "Elektrisch einklappbare Spiegel": "Power Folding Mirrors",
  "Regen-/Lichtsensor": "Rain/Light Sensor",
  Scheinwerferreinigungsanlage: "Headlight Washer System",
  Kurvenlicht: "Cornering Lights",

  // interior
  Sitzheizung: "Heated Seats",
  Sitzkühlung: "Seat Ventilation",
  Klimaanlage: "Air Conditioning",
  "Drei-Zonen-Klimaautomatik": "Three-Zone Climate Control",
  Ledersitze: "Leather Seats",
  "Elektrische Vordersitzeinstellung": "Electric Front Seat Adjustment",
  "Ambientebeleuchtung im Innenraum": "Ambient Interior Lighting",
  Lendenwirbelstütze: "Lumbar Support",
  "Beheizbares Lenkrad": "Heated Steering Wheel",
  "Head-up-Display": "Head-Up Display",
  "Apple CarPlay / Android Auto": "Apple CarPlay / Android Auto",
  "Apple CarPlay / Android Auto (Wireless)": "Wireless Apple CarPlay / Android Auto",
  "Kabellose Ladestation": "Wireless Charging Station",
  "Navigationssystem integriert": "Built-in Navigation",
  "Premium-Soundsystem": "Premium Sound System",

  // safety & driver assistance
  Fahrerassistenz: "Driver Assistance Level",
  "Adaptive Geschwindigkeitsregelung": "Adaptive Cruise Control",
  Tempomat: "Cruise Control",
  Isofix: "ISOFIX Child Seat Mounts",
  Spurhalteassistent: "Lane Keeping Assist",
  Parkassistent: "Parking Assist",
  Parksensoren: "Parking Sensors",
  Standheizung: "Auxiliary Heater",
  "Toter-Winkel-Assistent": "Blind Spot Monitoring",
  "Verkehrsquerenwarnung hinten": "Rear crosswalk warning",
  "360°-Kamera": "360° Camera",
  "180°- / Rückfahrkamera": "Rear View Camera",
  Berganfahrhilfe: "Hill Start Assist",
  Reifendruckkontrollsystem: "Tire Pressure Monitoring System",
  Verkehrszeichenerkennung: "Traffic Sign Recognition",
  Notbremsassistent: "Emergency Braking Assist",
  "Notrufsystem (eCall)": "Emergency Call System",

  // comfort
  "Keyless Entry & Start": "Keyless Entry & Start",
  "Elektrische Heckklappe": "Electric Tailgate",
  "Geteilte Rücksitzlehnen": "Split Folding Rear Seats",
  "USB-Anschlüsse vorne": "Front USB Ports",
  "USB-Anschlüsse hinten": "Rear USB Ports",
  "Start/Stopp-System": "Start/Stop System",
  "Elektrische Parkbremse": "Electronic Parking Brake",

  // tires & wheels
  Leichtmetallräder: "Alloy Wheels",
  Ersatzrad: "Spare Wheel",
  Felgengröße: "Wheel Size",

  // dimensions & specs
  Batteriekapazität: "Battery Capacity",
  Wärmepumpe: "Heat Pump",
  Länge: "Length",
  Breite: "Width",
  Höhe: "Height",
  Radstand: "Wheelbase",
  Kofferraumvolumen: "Trunk Capacity",
  Anhängerlast: "Towing Capacity",
  Höchstgeschwindigkeit: "Top Speed",
  "Ladezeit DC (10–80%)": "Charging Time DC (10–80%)",
};