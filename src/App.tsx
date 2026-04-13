/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { 
  Wind, 
  Navigation, 
  Cloud, 
  Eye, 
  RefreshCw, 
  ChevronDown, 
  AlertTriangle,
  Plane,
  Info,
  ArrowUp,
  ArrowRight,
  Compass,
  TrendingUp,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Legend,
  ReferenceLine
} from 'recharts';

// --- Constants ---

const AERODROMES = [
  {
    icao: "LPSO",
    name: "Ponte de Sor",
    latitude: 39.2117,
    longitude: -8.0578,
    runways: [
      { label: "03", heading: 26 },
      { label: "21", heading: 206 },
    ],
  },
  {
    icao: "LPCB",
    name: "Castelo Branco",
    latitude: 39.8483,
    longitude: -7.4417,
    runways: [
      { label: "16", heading: 157.43 },
      { label: "34", heading: 337.43 },
    ],
  },
  {
    icao: "LPEV",
    name: "Evora",
    latitude: 38.5297,
    longitude: -7.8919,
    runways: [
      { label: "01", heading: 4.25 },
      { label: "19", heading: 184.25 }
    ],
  },
  {
    icao: "LPCO",
    name: "Coimbra",
    latitude: 40.1561,
    longitude: -8.4692,
    runways: [
      { label: "16", heading: 153.29 },
      { label: "34", heading: 333.29 },
    ],
  },
  {
    icao: "LPCS",
    name: "Cascais",
    latitude: 38.7256,
    longitude: -9.3553,
    runways: [
      { label: "17", heading: 164.08 },
      { label: "35", heading: 344.08 },
    ],
  },
  {
    icao: "LPMT",
    name: "Montijo",
    latitude: 38.7039,
    longitude: -9.0358,
    runways: [
      { label: "08", heading: 77 },
      { label: "26", heading: 257 },
      { label: "01", heading: 11 },
      { label: "19", heading: 191 },
    ],
  },
];

type WeatherData = {
  windSpeed: number; // m/s
  windGust?: number; // m/s
  windDirection: number; // degrees
  visibility: number; // m
  cloudCeiling: number; // m
  temperature: number;
  updatedAt: string;
  forecast: Array<{
    time: string;
    windSpeed: number;
    windDirection: number;
    windGust?: number;
    temperature: number;
    visibility: number;
    cloudCeiling: number;
  }>;
};

type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR";

const FLIGHT_CAT_INFO: Record<FlightCategory, { label: string, emoji: string, color: string }> = {
  VFR: { label: "VFR", emoji: "🟢", color: "bg-emerald-500" },
  MVFR: { label: "MVFR", emoji: "🔵", color: "bg-blue-500" },
  IFR: { label: "IFR", emoji: "🔴", color: "bg-red-500" },
  LIFR: { label: "LIFR", emoji: "🟣", color: "bg-purple-600" },
};

// --- Utilities ---

const msToKnots = (ms: number) => ms * 1.94384;
const metersToFeet = (m: number) => m * 3.28084;
const metersToKm = (m: number) => m / 1000;
const roundToNearestTen = (value: number) => Math.round(value / 10) * 10;

const calculateWindComponents = (windSpeed: number, windDir: number, rwyHeading: number) => {
  const diff = (windDir - rwyHeading) * (Math.PI / 180);
  const headwind = windSpeed * Math.cos(diff);
  const crosswind = windSpeed * Math.sin(diff);
  return { headwind, crosswind };
};

const getFlightCategory = (ceilingFt: number, visibilityKm: number): FlightCategory => {
  const ceiling = ceilingFt < 0 ? 10000 : ceilingFt;
  if (ceiling > 3000 && visibilityKm > 8) return "VFR";
  if ((ceiling >= 1000 && ceiling <= 3000) || (visibilityKm >= 5 && visibilityKm <= 8)) return "MVFR";
  if ((ceiling >= 500 && ceiling < 1000) || (visibilityKm >= 1.6 && visibilityKm < 5)) return "IFR";
  return "LIFR";
};

const getCategoryColor = (cat: FlightCategory) => {
  switch (cat) {
    case "VFR": return "bg-emerald-500 text-white";
    case "MVFR": return "bg-blue-500 text-white";
    case "IFR": return "bg-red-500 text-white";
    case "LIFR": return "bg-purple-600 text-white";
    default: return "bg-gray-500 text-white";
  }
};

// --- Components ---

const CompassSVG = ({ 
  windDir, 
  activeRwy, 
  allRunways 
}: { 
  windDir: number, 
  activeRwy: { label: string, heading: number }, 
  allRunways: Array<{ label: string, heading: number }> 
}) => {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  const labels = [
    { deg: 0, text: "N" },
    { deg: 30, text: "3" },
    { deg: 60, text: "6" },
    { deg: 90, text: "E" },
    { deg: 120, text: "12" },
    { deg: 150, text: "15" },
    { deg: 180, text: "S" },
    { deg: 210, text: "21" },
    { deg: 240, text: "24" },
    { deg: 270, text: "W" },
    { deg: 300, text: "30" },
    { deg: 330, text: "33" },
  ];

  // Group runways into physical axes (e.g., 03 and 21 share an axis)
  const physicalAxes = useMemo(() => {
    const axes: Array<{ heading: number, labels: string[] }> = [];
    allRunways.forEach(r => {
      const canonicalHeading = r.heading % 180;
      const existing = axes.find(a => {
        const diff = Math.abs(a.heading - canonicalHeading);
        return Math.min(diff, 180 - diff) < 10;
      });
      if (existing) {
        if (!existing.labels.includes(r.label)) existing.labels.push(r.label);
      } else {
        axes.push({ heading: canonicalHeading, labels: [r.label] });
      }
    });
    return axes;
  }, [allRunways]);

  return (
    <div className="relative w-full aspect-square max-w-[320px] mx-auto bg-[#0056a4] rounded-full shadow-inner border-4 border-slate-800/20 overflow-hidden">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Dial Ticks */}
        {ticks.map(deg => (
          <line
            key={deg}
            x1="50" y1="2" x2="50" y2={deg % 90 === 0 ? "8" : "5"}
            stroke="white" strokeWidth={deg % 90 === 0 ? "0.8" : "0.4"}
            strokeOpacity="0.6"
            transform={`rotate(${deg}, 50, 50)`}
          />
        ))}

        {/* Dial Labels */}
        {labels.map(({ deg, text }) => (
          <text
            key={deg}
            x="50" y="15"
            textAnchor="middle"
            fontSize="7"
            className="fill-white/80 font-medium select-none"
            transform={`rotate(${deg}, 50, 50)`}
          >
            {text}
          </text>
        ))}

        {/* All Runway Strips */}
        {physicalAxes.map((axis, idx) => {
          const isActiveAxis = axis.labels.includes(activeRwy.label);
          return (
            <g key={idx} transform={`rotate(${axis.heading}, 50, 50)`}>
              {/* Runway Body */}
              <rect 
                x={isActiveAxis ? "46" : "47.5"} 
                y="25" 
                width={isActiveAxis ? "8" : "5"} 
                height="50" 
                rx="0.5" 
                fill={isActiveAxis ? "#111" : "#111"} 
                fillOpacity={isActiveAxis ? "1" : "0.3"} 
              />
              
              {isActiveAxis && (
                <>
                  {/* Dashed Center Line */}
                  <line x1="50" y1="30" x2="50" y2="70" stroke="white" strokeWidth="0.4" strokeDasharray="2 1" strokeOpacity="0.6" />

                  {/* Threshold Markings (Piano Keys) - Bottom (Entry Threshold) */}
                  <g transform="translate(46.5, 68)">
                    {[0, 1.5, 3, 4.5, 6].map(x => (
                      <rect key={x} x={x} y="0" width="0.8" height="4" fill="white" fillOpacity="0.9" />
                    ))}
                  </g>

                  {/* Active Runway Label (At the BOTTOM - where the plane enters) */}
                  <text x="50" y="82" textAnchor="middle" fontSize="6" className="fill-white font-black">
                    {activeRwy.label}
                  </text>
                  
                  {/* Reciprocal Label (At the TOP - the exit end) */}
                  {allRunways.find(r => {
                    const diff = Math.abs(r.heading - ((activeRwy.heading + 180) % 360));
                    return Math.min(diff, 360 - diff) < 10;
                  })?.label && (
                    <text x="50" y="20" textAnchor="middle" fontSize="5" className="fill-white/60 font-bold" transform="rotate(180, 50, 20)">
                      {allRunways.find(r => {
                        const diff = Math.abs(r.heading - ((activeRwy.heading + 180) % 360));
                        return Math.min(diff, 360 - diff) < 10;
                      })?.label}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Wind Vector (Overlaid) */}
        <g transform={`rotate(${windDir}, 50, 50)`}>
          <line x1="50" y1="0" x2="50" y2="35" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M46 30 L50 38 L54 30" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="50" cy="0" r="2.5" className="fill-emerald-500" />
        </g>

        {/* Center Point */}
        <circle cx="50" cy="50" r="1.5" className="fill-white/20" />
      </svg>
    </div>
  );
};

export default function App() {
  const [selectedIcao, setSelectedIcao] = useState("LPSO");
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [manualRwy, setManualRwy] = useState<Record<string, string>>({});

  const selectedAerodrome = useMemo(() => 
    AERODROMES.find(a => a.icao === selectedIcao) || AERODROMES[0], 
  [selectedIcao]);

  const currentWeatherData = weatherData[selectedIcao];

  const fetchWeather = useCallback(async (icao: string) => {
    const ad = AERODROMES.find(a => a.icao === icao);
    if (!ad) return;

    setLoading(true);
    setError(null);

    try {
      // Using Met.no API (Locationforecast 2.0 Complete)
      const response = await fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${ad.latitude}&lon=${ad.longitude}`
      );

      if (!response.ok) throw new Error("Weather service unavailable");

      const data = await response.json();
      const timeseries = data.properties.timeseries;
      const current = timeseries[0].data.instant.details;
      
      const processPoint = (details: any) => {
        const windSpeed = details.wind_speed;
        const windGust = details.wind_speed_of_gust;
        const windDir = details.wind_from_direction;
        const temp = details.air_temperature;
        
        // Estimate visibility
        const fog = details.fog_area_fraction || 0;
        const visibility = fog > 50 ? 500 : fog > 20 ? 2000 : fog > 5 ? 5000 : 10000;

        // Better ceiling logic using cloud_base_altitude if available
        let cloudCeiling = 10000; // Default to high
        if (details.cloud_base_altitude !== undefined) {
          cloudCeiling = details.cloud_base_altitude;
        } else {
          // Fallback to estimation only if cloud fraction is significant
          const lowClouds = details.cloud_area_fraction_low || 0;
          const totalClouds = details.cloud_area_fraction || 0;
          if (lowClouds > 25) {
            cloudCeiling = lowClouds > 80 ? 300 : lowClouds > 50 ? 600 : 1000;
          } else if (totalClouds > 50) {
            cloudCeiling = 1500;
          } else {
            cloudCeiling = -1; // Indicator for "No Ceiling"
          }
        }

        return { windSpeed, windGust, windDirection: windDir, temperature: temp, visibility, cloudCeiling };
      };

      const currentProcessed = processPoint(current);
      
      const forecast = timeseries.slice(1, 13).map((ts: any) => ({
        time: ts.time,
        ...processPoint(ts.data.instant.details)
      }));

      setWeatherData(prev => ({
        ...prev,
        [icao]: {
          ...currentProcessed,
          updatedAt: new Date().toISOString(),
          forecast
        }
      }));
    } catch (err) {
      setError("Failed to fetch live data. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!weatherData[selectedIcao]) {
      fetchWeather(selectedIcao);
    }
  }, [selectedIcao, fetchWeather, weatherData]);

  const bestRunway = useMemo(() => {
    if (!currentWeatherData) return selectedAerodrome.runways[0];
    
    // Find runway with maximum headwind
    return selectedAerodrome.runways.reduce((best, current) => {
      const { headwind: currentHead } = calculateWindComponents(
        currentWeatherData.windSpeed,
        currentWeatherData.windDirection,
        current.heading
      );
      const { headwind: bestHead } = calculateWindComponents(
        currentWeatherData.windSpeed,
        currentWeatherData.windDirection,
        best.heading
      );
      return currentHead > bestHead ? current : best;
    }, selectedAerodrome.runways[0]);
  }, [selectedAerodrome, currentWeatherData]);

  const activeRwyLabel = manualRwy[selectedIcao] || bestRunway.label;
  const activeRwy = selectedAerodrome.runways.find(r => r.label === activeRwyLabel) || bestRunway;

  const otherRwyLabel = useMemo(() => {
    const oppositeHeading = (activeRwy.heading + 180) % 360;
    return selectedAerodrome.runways.find(r => {
      const diff = Math.abs(r.heading - oppositeHeading);
      return Math.min(diff, 360 - diff) < 10;
    })?.label || "";
  }, [activeRwy, selectedAerodrome]);

  const windComponents = useMemo(() => {
    if (!currentWeatherData) return { headwind: 0, crosswind: 0 };
    return calculateWindComponents(
      msToKnots(currentWeatherData.windSpeed),
      currentWeatherData.windDirection,
      activeRwy.heading
    );
  }, [currentWeatherData, activeRwy]);

  const flightCat = currentWeatherData 
    ? getFlightCategory(metersToFeet(currentWeatherData.cloudCeiling), metersToKm(currentWeatherData.visibility))
    : "VFR";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-sky-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center text-white">
              <Navigation className="w-5 h-5 rotate-45" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">
              Wind<span className="text-sky-600">.pt</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => fetchWeather(selectedIcao)}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-full transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-500">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live Data
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          
          {/* Aerodrome Selection - Compact for Mobile, Sidebar for Desktop */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between lg:block">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2 mb-2 lg:mb-4">
                Aerodromes
              </h2>
              <div className="lg:hidden text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                {selectedAerodrome.icao} Selected
              </div>
            </div>

            {/* Horizontal Scroll on Mobile, Vertical List on Desktop */}
            <div className="flex lg:flex-col gap-2 overflow-x-auto pb-3 lg:pb-0 scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
              {AERODROMES.map((ad) => {
                const isActive = selectedIcao === ad.icao;
                const isLPSO = ad.icao === "LPSO";
                return (
                  <button
                    key={ad.icao}
                    onClick={() => setSelectedIcao(ad.icao)}
                    className={`flex-shrink-0 lg:w-full text-left px-3 py-2 lg:px-4 lg:py-3 rounded-xl transition-all flex items-center justify-between group border ${
                      isActive 
                        ? 'bg-white shadow-sm border-slate-200 text-sky-600' 
                        : isLPSO 
                          ? 'bg-sky-50/50 border-sky-100 text-slate-600 hover:bg-sky-100/50'
                          : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 lg:block">
                      <div className="flex items-center gap-1.5">
                        <div className={`font-black text-[10px] lg:text-sm ${isActive ? 'text-sky-600' : 'text-slate-400'}`}>
                          {ad.icao}
                        </div>
                        {isLPSO && <div className="w-1 h-1 bg-sky-400 rounded-full" />}
                      </div>
                      <div className="text-[9px] lg:text-[10px] font-bold opacity-70 truncate max-w-[60px] lg:max-w-[120px]">
                        {ad.name}
                      </div>
                    </div>
                    {isActive && (
                      <motion.div layoutId="active-indicator" className="hidden lg:block">
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Dashboard */}
          <div className="lg:col-span-9 space-y-6">
            
            {/* Aerodrome Info Header */}
            <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center justify-between md:block w-full md:w-auto">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{selectedAerodrome.icao}</h2>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${FLIGHT_CAT_INFO[flightCat].color} text-white`}>
                      <span>{FLIGHT_CAT_INFO[flightCat].emoji}</span>
                      {FLIGHT_CAT_INFO[flightCat].label}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-slate-500 font-medium">{selectedAerodrome.name}</p>
                </div>
                
                {/* Mobile Refresh Button */}
                <button 
                  onClick={() => fetchWeather(selectedIcao)}
                  className="md:hidden p-3 bg-slate-50 text-slate-400 rounded-xl active:bg-sky-50 active:text-sky-600 transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col w-full md:w-auto">
                  <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Select Runway</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedAerodrome.runways.map(r => {
                      const isAuto = r.label === bestRunway.label;
                      const isActive = r.label === activeRwyLabel;
                      const comps = currentWeatherData ? calculateWindComponents(
                        msToKnots(currentWeatherData.windSpeed),
                        currentWeatherData.windDirection,
                        r.heading
                      ) : { headwind: 0, crosswind: 0 };

                      return (
                        <button
                          key={r.label}
                          onClick={() => setManualRwy(prev => ({ ...prev, [selectedIcao]: r.label }))}
                          className={`relative px-3 py-1.5 md:px-4 md:py-2 rounded-xl border transition-all text-left flex flex-col min-w-[100px] md:min-w-[140px] ${
                            isActive 
                              ? 'bg-sky-600 border-sky-600 text-white shadow-md' 
                              : 'bg-white border-slate-200 text-slate-700 hover:border-sky-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-black text-xs md:text-sm tracking-tight">RWY {r.label}</span>
                            {isAuto && (
                              <span className={`text-[7px] md:text-[8px] font-black px-1 md:px-1.5 py-0.5 rounded uppercase ${isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                                Best
                              </span>
                            )}
                          </div>
                          <div className={`text-[8px] md:text-[10px] font-bold flex gap-2 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                            <span>HW: {comps.headwind.toFixed(0)}k</span>
                            <span>XW: {Math.abs(comps.crosswind).toFixed(0)}k</span>
                          </div>
                          {isActive && (
                            <motion.div 
                              layoutId="active-rwy-glow"
                              className="absolute inset-0 rounded-xl ring-2 ring-sky-400 ring-offset-1 md:ring-offset-2 pointer-events-none"
                              initial={false}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Wind Components Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              
              {/* Compass Card */}
              <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-4 left-4 flex items-center gap-2 text-slate-400">
                  <Compass className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Visualizer</span>
                </div>
                {currentWeatherData ? (
                  <CompassSVG 
                    windDir={currentWeatherData.windDirection} 
                    activeRwy={activeRwy}
                    allRunways={selectedAerodrome.runways}
                  />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 text-slate-200 animate-spin" />
                  </div>
                )}
                <div className="mt-4 md:mt-6 text-center">
                  <div className="text-xl md:text-2xl font-black text-slate-800">
                    {currentWeatherData ? (
                      <>
                        {currentWeatherData.windDirection}° <span className="text-slate-400 font-medium text-base md:text-lg">FROM</span> @ {roundToNearestTen(msToKnots(currentWeatherData.windSpeed))}
                        {currentWeatherData.windGust && currentWeatherData.windGust > currentWeatherData.windSpeed + 2 && (
                          <span className="text-orange-500"> G {roundToNearestTen(msToKnots(currentWeatherData.windGust))}</span>
                        )}
                        <span className="text-slate-400 font-medium text-base md:text-lg ml-1">KT</span>
                      </>
                    ) : '--'}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Current Wind</p>
                </div>
              </div>

              {/* Components Card */}
              <div className="grid grid-cols-1 gap-4">
                {/* Headwind */}
                <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center ${windComponents.headwind >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      <ArrowUp className={`w-5 h-5 md:w-6 md:h-6 ${windComponents.headwind < 0 ? 'rotate-180' : ''}`} />
                    </div>
                    <div>
                      <div className={`text-base md:text-lg font-black ${windComponents.headwind >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {Math.abs(windComponents.headwind).toFixed(0)} KT
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {windComponents.headwind >= 0 ? 'Headwind' : 'Tailwind'}
                      </p>
                    </div>
                  </div>
                  {windComponents.headwind < 0 && (
                    <div className="px-2 py-1 bg-red-100 text-red-700 rounded text-[8px] md:text-[10px] font-black uppercase">Tailwind</div>
                  )}
                </div>

                {/* Crosswind */}
                <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center ${Math.abs(windComponents.crosswind) > 12 ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                      <ArrowRight className={`w-5 h-5 md:w-6 md:h-6 ${windComponents.crosswind < 0 ? 'rotate-180' : ''}`} />
                    </div>
                    <div>
                      <div className={`text-base md:text-lg font-black ${Math.abs(windComponents.crosswind) > 15 ? 'text-red-600' : Math.abs(windComponents.crosswind) > 10 ? 'text-orange-500' : 'text-slate-800'}`}>
                        {Math.abs(windComponents.crosswind).toFixed(0)} KT
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        X-Wind {windComponents.crosswind >= 0 ? '(R)' : '(L)'}
                      </p>
                    </div>
                  </div>
                  {Math.abs(windComponents.crosswind) > 15 && (
                    <div className="px-2 py-1 bg-red-100 text-red-700 rounded text-[8px] md:text-[10px] font-black uppercase">Critical</div>
                  )}
                </div>

                {/* Conditions Summary */}
                <div className="bg-slate-900 rounded-2xl p-4 md:p-5 shadow-lg flex items-center justify-between text-white">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-xl flex items-center justify-center">
                      <Plane className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div>
                      <div className="text-base md:text-lg font-black">
                        {currentWeatherData ? `${currentWeatherData.temperature.toFixed(0)}°C` : '--'}
                      </div>
                      <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Air Temp</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] md:text-[10px] font-bold text-white/50 uppercase tracking-tighter mb-1">Updated</div>
                    <div className="text-[9px] md:text-[10px] font-mono opacity-80">
                      {currentWeatherData ? new Date(currentWeatherData.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex items-center gap-5">
                <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xl font-black text-slate-800">
                    {currentWeatherData ? `> ${metersToKm(currentWeatherData.visibility).toFixed(0)} KM` : '--'}
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visibility</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex items-center gap-5">
                <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xl font-black text-slate-800">
                    {currentWeatherData ? (
                      currentWeatherData.cloudCeiling < 0 ? "CAVOK" : `${metersToFeet(currentWeatherData.cloudCeiling).toFixed(0)} FT`
                    ) : '--'}
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cloud Ceiling</p>
                </div>
              </div>
            </div>

            {/* Forecast Section */}
            {currentWeatherData?.forecast && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" /> 12-Hour Interactive Forecast
                  </h3>
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-tighter">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-sky-500 rounded-full" />
                      <span className="text-slate-500">Wind</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-orange-400 rounded-full" />
                      <span className="text-slate-500">Gusts</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-slate-500">Visibility</span>
                    </div>
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={currentWeatherData.forecast.map(f => ({
                        time: new Date(f.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        wind: roundToNearestTen(msToKnots(f.windSpeed)),
                        gust: roundToNearestTen(msToKnots(f.windGust || f.windSpeed)),
                        vis: Number(metersToKm(f.visibility).toFixed(1)),
                        ceiling: f.cloudCeiling < 0 ? 10 : Number((metersToFeet(f.cloudCeiling) / 1000).toFixed(1)),
                        rawTime: f.time
                      }))}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorWind" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                        dy={10}
                      />
                      <YAxis 
                        yAxisId="left"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#0ea5e9', fontWeight: 600 }}
                        label={{ value: 'Wind (kt)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#0ea5e9', fontWeight: 700 }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#10b981', fontWeight: 600 }}
                        domain={[0, 10]}
                        label={{ value: 'Visibility (km)', angle: 90, position: 'insideRight', fontSize: 10, fill: '#10b981', fontWeight: 700 }}
                      />
                      <YAxis
                        yAxisId="ceiling"
                        orientation="right"
                        hide
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: 'none', 
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                        }}
                        itemStyle={{ color: '#fff' }}
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                        formatter={(value: number, name: string) => {
                          if (name === "Ceiling (kft)") return [`${value.toFixed(1)} kft`, name];
                          if (name === "Visibility (km)") return [`${value.toFixed(1)} km`, name];
                          return [`${value.toFixed(0)} kt`, name];
                        }}
                      />
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="gust" 
                        stroke="#fb923c" 
                        fill="transparent" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Gusts (kt)"
                      />
                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="wind" 
                        stroke="#0ea5e9" 
                        fillOpacity={1} 
                        fill="url(#colorWind)" 
                        strokeWidth={3}
                        name="Wind (kt)"
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="vis" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#10b981' }}
                        name="Visibility (km)"
                      />
                      <Line 
                        yAxisId="ceiling"
                        type="monotone" 
                        dataKey="ceiling" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        dot={false}
                        name="Ceiling (kft)"
                      />
                      <Legend 
                        verticalAlign="top" 
                        height={36} 
                        iconType="circle" 
                        wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {currentWeatherData.forecast.slice(0, 4).map((f, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:shadow-md hover:bg-white group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(f.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="w-2 h-2 bg-sky-500 rounded-full group-hover:animate-ping" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500">Wind</span>
                          <div className="flex items-center gap-1">
                            <ArrowUp 
                              className="w-2.5 h-2.5 text-sky-500" 
                              style={{ transform: `rotate(${f.windDirection}deg)` }} 
                            />
                            <span className="text-xs font-black text-slate-800">{roundToNearestTen(msToKnots(f.windSpeed))}kt</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500">Ceiling</span>
                          <span className="text-xs font-black text-sky-600">
                            {f.cloudCeiling < 0 ? "—" : `${metersToFeet(f.cloudCeiling).toFixed(0)}ft`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500">Vis</span>
                          <span className="text-xs font-black text-emerald-600">{metersToKm(f.visibility).toFixed(0)}km</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="p-4 bg-slate-100 rounded-xl flex items-start gap-3">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                <strong>Disclaimer:</strong> This dashboard is for informational purposes only. Data is sourced from Met.no and may not reflect real-time local conditions. Always consult official METAR/TAF and NOTAMs before flight operations. Runway headings are magnetic.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-xs text-slate-400 font-medium">
          © 2026 Wind.pt — Portuguese General Aviation Dashboard
        </p>
      </footer>
    </div>
  );
}
