#!/usr/bin/env python3

import argparse
import json
import subprocess
import time

import requests

BURP_API = "http://127.0.0.1:1337"
BURP_JAR = "/Applications/Burp Suite Professional.app/Contents/Resources/app/burpsuite_pro.jar"
BURP_JAVA = "/Applications/Burp Suite Professional.app/Contents/Resources/jre.bundle/Contents/Home/bin/java"
POLL_INTERVAL = 5


def start_burp():
    print("Starting Burp Suite...")
    proc = subprocess.Popen(
        [BURP_JAVA, "-Djava.awt.headless=true", "-jar", BURP_JAR, "--unpause-spider-and-scanner"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Wait for the API to become available
    time.sleep(15)
    return proc

def create_scan(url, config_path):
    with open(config_path) as f:
        config = json.load(f)

    payload = {
        "scan_configurations": [
            {"config": json.dumps(config), "type": "CustomConfiguration"}
        ],
        "urls": [url],
    }

    resp = requests.post(f"{BURP_API}/v0.1/scan", json=payload)
    resp.raise_for_status()

    scan_id = resp.headers["location"]
    print(f"Scan created with ID: {scan_id}")
    return scan_id


def wait_for_scan(scan_id):
    print("Waiting for scan to complete...")
    while True:
        resp = requests.get(f"{BURP_API}/v0.1/scan/{scan_id}")
        resp.raise_for_status()
        scan_data = resp.json()
        status = scan_data.get("scan_status", "unknown")
        print(f"  Status: {status}")
        if status in ("succeeded", "failed"):
            return scan_data
        time.sleep(POLL_INTERVAL)


def main():
    parser = argparse.ArgumentParser(description="Run a Burp Suite scan")
    parser.add_argument("url", help="Target URL to scan")
    parser.add_argument("config", help="Path to scan configuration JSON file")
    parser.add_argument(
        "-o", "--output", default="scan_output.json", help="Output file (default: scan_output.json)"
    )
    args = parser.parse_args()

    burp_proc = start_burp()
    try:
        scan_id = create_scan(args.url, args.config)
        scan_data = wait_for_scan(scan_id)

        with open(args.output, "w") as f:
            json.dump(scan_data, f, indent=2)
        print(f"Scan results saved to {args.output}")
    finally:
        print("Shutting down Burp Suite...")
        burp_proc.terminate()
        burp_proc.wait(timeout=10)


if __name__ == "__main__":
    main()
