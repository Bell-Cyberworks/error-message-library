package eml

import "os"

// Reads library configuration from environment variables, lazily — freshly on every lookup
// call, never cached in a package-level var at init/load time. A missing or blank environment
// variable must never be able to break anything at package-load time, since that would
// undermine the very type (EMLError) whose entire job is to report configuration and lookup
// failures gracefully instead of crashing the calling application.

func appName() string {
	return os.Getenv("APPNAME")
}

func apiBaseURL() string {
	return os.Getenv("EML_API")
}

func environment() string {
	return os.Getenv("ENVIRONMENT")
}

func apiKey() string {
	return os.Getenv("EML_API_KEY")
}

// defaultLanguage returns "en". There is no LANGUAGE environment variable — this mirrors the
// server's own default in resolveLanguage() (error-management-ui/src/app/api/v1/lookup/route.ts)
// for a missing/absent Accept-Language header, and matches the Java, JavaScript, and Python
// libraries' identical decision.
func defaultLanguage() string {
	return "en"
}
