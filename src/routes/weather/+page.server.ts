import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, fetch }) => {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  
  const fetchWeather = async () => {
    try {
      if (!lat || !lng) {
        return null;
      }
      
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${parseFloat(lat)}&longitude=${parseFloat(lng)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`);
      const weatherData = await weatherResponse.json();

      return {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        weather: weatherData
      };
    } catch (err) {
      console.error('Weather fetch error:', err);
      return { error: 'Failed to fetch weather data' };
    }
  };

  return {
    streamed: {
      weatherData: fetchWeather()
    }
  };
};
