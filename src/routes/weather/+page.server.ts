import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, fetch }) => {
  // SSR: Get weather for a default or query-param city
  const city = url.searchParams.get('city') || 'Ho Chi Minh City';
  
  try {
    // 1. Get coordinates for the city (Geocoding API)
    const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const geoData = await geoResponse.json();
    
    if (!geoData.results || geoData.results.length === 0) {
       return { city, error: 'City not found' };
    }
    
    const location = geoData.results[0];
    const { latitude, longitude, name, country } = location;
    
    // 2. Get weather data for coordinates
    const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`);
    const weatherData = await weatherResponse.json();

    return {
      city: name,
      country,
      weather: weatherData
    };
  } catch (err) {
    console.error('Weather fetch error:', err);
    return { city, error: 'Failed to fetch weather data' };
  }
};
