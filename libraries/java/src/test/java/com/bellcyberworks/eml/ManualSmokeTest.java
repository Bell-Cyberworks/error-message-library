package com.bellcyberworks.eml;

/**
 * Manual, JUnit-free smoke test for the EML Java client.
 *
 * <p>There is no build tool (Maven/Gradle) available in the environment this library was
 * originally built in, so this is a plain class with a {@code public static void main}
 * instead of a real JUnit test class — compile and run it directly with {@code javac}/
 * {@code java} against a real, running {@code error-management-ui} instance. (Once a build
 * tool is available elsewhere, {@code mvn test}/{@code mvn package} work fine against the
 * {@code pom.xml} in this module; this class is intentionally excluded from Surefire's
 * default test discovery — see {@code pom.xml} — since it isn't a JUnit test.)
 *
 * <p>Compile and run, e.g.:
 * <pre>
 *   javac -d out $(find src/main src/test -name "*.java")
 *   APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev EML_API_KEY=my-key \
 *     java -cp out com.bellcyberworks.eml.ManualSmokeTest SOME_CODE
 * </pre>
 *
 * <p>Run it multiple times with different {@code args[0]} codes (a known-existing code, a
 * brand-new/never-before-seen code to exercise server-side auto-registration, etc.) and
 * different environment variable combinations (e.g. omitting one to exercise the
 * no-network-attempt validation failure, or pointing {@code EML_API} at an unreachable host
 * to exercise the local fallback) — one scenario per run, rather than scripting multiple
 * scenarios into a single run.
 */
public final class ManualSmokeTest {

    private ManualSmokeTest() {
    }

    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: java com.bellcyberworks.eml.ManualSmokeTest <errorCode>");
            System.exit(1);
            return;
        }
        String code = args[0];

        String apiKey = System.getenv("EML_API_KEY");
        boolean apiKeySet = apiKey != null && !apiKey.isBlank();

        System.out.println("CONFIG APPNAME=" + System.getenv("APPNAME")
                + " EML_API=" + System.getenv("EML_API")
                + " ENVIRONMENT=" + System.getenv("ENVIRONMENT")
                + " EML_API_KEY_SET=" + apiKeySet);

        try {
            throw new EMLError(code);
        } catch (EMLError e) {
            System.out.println("RESULT"
                    + " resolved=" + e.isResolved()
                    + " code=\"" + e.getCode() + "\""
                    + " appname=\"" + e.getAppname() + "\""
                    + " environment=\"" + e.getEnvironment() + "\""
                    + " language=\"" + e.getLanguage() + "\""
                    + " header=\"" + e.getHeader() + "\""
                    + " description=\"" + e.getDescription() + "\""
                    + " friendlyMessage=\"" + e.getFriendlyMessage() + "\""
                    + " category=\"" + e.getCategory() + "\""
                    + " errorCategory=\"" + e.getErrorCategory() + "\""
                    + " httpCode=" + e.getHttpCode()
                    + " alertString=\"" + e.getAlertString() + "\""
                    + " redirectUrl=\"" + e.getRedirectUrl() + "\""
                    + " eventId=\"" + e.getEventId() + "\""
                    + " eventCategory=\"" + e.getEventCategory() + "\""
                    + " transIdDisplay=" + e.isTransIdDisplay()
                    + " retryEnabled=" + e.isRetryEnabled()
                    + " errorCodeDisplay=" + e.isErrorCodeDisplay()
                    + " needsAuthoring=" + e.isNeedsAuthoring()
                    + " exceptionMessage=\"" + e.getMessage() + "\"");
        }
    }
}
