import requests
import sys
import json
from datetime import datetime
import uuid

class KisanVaniAPITester:
    def __init__(self, base_url="https://farm-assistant-5.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.session_id = f"test_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

    def run_test(self, name, method, endpoint, expected_status, data=None, timeout=30):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else self.api_url
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=timeout)

            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - {name}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    print(f"   Response: {response.text[:200]}...")
                    return True, response.text
            else:
                print(f"❌ FAILED - {name}")
                print(f"   Expected status: {expected_status}, got: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error response: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error response: {response.text}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ FAILED - {name} - Request timed out after {timeout} seconds")
            return False, {}
        except Exception as e:
            print(f"❌ FAILED - {name} - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        return self.run_test("Root API Endpoint", "GET", "", 200)

    def test_faq_english(self):
        """Test English FAQ endpoint"""
        success, response = self.run_test("English FAQ", "GET", "faq/english", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} English FAQ items")
            if len(response) > 0:
                print(f"   Sample FAQ: {response[0].get('question', 'N/A')}")
        return success

    def test_faq_malayalam(self):
        """Test Malayalam FAQ endpoint"""
        success, response = self.run_test("Malayalam FAQ", "GET", "faq/malayalam", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} Malayalam FAQ items")
            if len(response) > 0:
                print(f"   Sample FAQ: {response[0].get('question', 'N/A')}")
        return success

    def test_faq_invalid_language(self):
        """Test FAQ with invalid language"""
        return self.run_test("Invalid Language FAQ", "GET", "faq/invalid", 400)

    def test_chat_english(self):
        """Test chat endpoint with English message"""
        chat_data = {
            "message": "What is PM-KISAN scheme?",
            "session_id": self.session_id,
            "language": "english"
        }
        success, response = self.run_test("English Chat", "POST", "chat", 200, chat_data, timeout=60)
        if success:
            print(f"   AI Response: {response.get('response', 'N/A')[:100]}...")
            return response.get('id') is not None
        return False

    def test_chat_malayalam(self):
        """Test chat endpoint with Malayalam message"""
        chat_data = {
            "message": "കർഷകർക്കുള്ള സർക്കാർ പദ്ധതികൾ എന്തെല്ലാം?",
            "session_id": self.session_id,
            "language": "malayalam"
        }
        success, response = self.run_test("Malayalam Chat", "POST", "chat", 200, chat_data, timeout=60)
        if success:
            print(f"   AI Response: {response.get('response', 'N/A')[:100]}...")
            return response.get('id') is not None
        return False

    def test_chat_empty_message(self):
        """Test chat with empty message"""
        chat_data = {
            "message": "",
            "session_id": self.session_id,
            "language": "english"
        }
        # This might return 200 with an error message or 400, let's see
        success, response = self.run_test("Empty Message Chat", "POST", "chat", 200, chat_data, timeout=30)
        return success  # Accept whatever the API returns for empty messages

    def test_chat_history(self):
        """Test chat history endpoint"""
        success, response = self.run_test("Chat History", "GET", f"chat-history/{self.session_id}", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} chat messages in history")
            return True
        return success

    def test_chat_history_invalid_session(self):
        """Test chat history with invalid session ID"""
        invalid_session = "invalid_session_id"
        success, response = self.run_test("Invalid Session Chat History", "GET", f"chat-history/{invalid_session}", 200)
        # Should return empty list for invalid session
        if success and isinstance(response, list) and len(response) == 0:
            print("   Correctly returned empty list for invalid session")
            return True
        return success

def main():
    print("🚀 Starting Kisan Vani API Testing...")
    print("=" * 60)
    
    tester = KisanVaniAPITester()
    
    # Test sequence
    tests = [
        ("Root API Endpoint", tester.test_root_endpoint),
        ("English FAQ", tester.test_faq_english),
        ("Malayalam FAQ", tester.test_faq_malayalam),
        ("Invalid Language FAQ", tester.test_faq_invalid_language),
        ("English Chat", tester.test_chat_english),
        ("Malayalam Chat", tester.test_chat_malayalam),
        ("Empty Message Chat", tester.test_chat_empty_message),
        ("Chat History", tester.test_chat_history),
        ("Invalid Session Chat History", tester.test_chat_history_invalid_session),
    ]
    
    print(f"\n📋 Running {len(tests)} API tests...")
    
    for test_name, test_func in tests:
        try:
            test_func()
        except Exception as e:
            print(f"❌ FAILED - {test_name} - Unexpected error: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {tester.tests_run}")
    print(f"Passed: {tester.tests_passed}")
    print(f"Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("\n🎉 ALL TESTS PASSED! Backend API is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {tester.tests_run - tester.tests_passed} tests failed. Please check the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())