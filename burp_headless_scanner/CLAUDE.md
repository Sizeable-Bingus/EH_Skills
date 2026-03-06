## Starting Burp
`"/Applications/Burp Suite Professional.app/Contents/Resources/jre.bundle/Contents/Home/bin/java" -Djava.awt.headless=true -jar "/Applications/Burp Suite Professional.app/Contents/Resources/app/burpsuite_pro.jar" --project-file=./scanner.burp`
    - Starts Burp in headless mode
    - May need to manually uncheck start automated tasks paused in scanner UI

## Burp API

`GET v0.1/scan/4'`
    - Gets scan with ID 4
`POST 'http://127.0.0.1:1337/v0.1/scan' -d '{"scan_configurations":[{"config":"<SCAN_CONFIG_JSON>","type":"CustomConfiguration"}],"urls":["http://10.3.10.10:1234/"]}'`
    - Scan ID is returned in the `location` header

## Scan Configurations

- test_light.json
    - Minimal config for development purposes
