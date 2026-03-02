import { query, getRequestEvent } from '$app/server'
import * as v from 'valibot'

import { fetchServerIpLocation, fetchServerReverseGeocode, getCloudflareIpLocation } from './api/weather-service'

// Remote function for IP Location
export const getIpLocationRemote = query(async () => {
	// Call getRequestEvent synchronously, before any awaits, to avoid throwing
	// when AsyncLocalStorage is unavailable during initialization.
	const event = getRequestEvent()

	const cfLocation = getCloudflareIpLocation(event.platform?.cf)
	if (cfLocation) {
		return cfLocation
	}

	const clientIp = event.getClientAddress()
	return await fetchServerIpLocation(event.fetch, clientIp)
})

// Validation schema for reverse geocode remote function
const reverseGeocodeParamsSchema = v.object({
	lat: v.number(),
	lng: v.number(),
})

// Remote function for Reverse Geocoding
export const getReverseGeocodeRemote = query(reverseGeocodeParamsSchema, async ({ lat, lng }) => {
	const event = getRequestEvent()
	return await fetchServerReverseGeocode(lat.toString(), lng.toString(), event.fetch)
})
