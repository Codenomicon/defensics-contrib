#!/usr/bin/env python
# SMS notification for Defensics 
# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/


from twilio.rest import TwilioRestClient

#account number from twilio account
account = "#"

#token from twilio account
token = "##"
client = TwilioRestClient(account, token)

#phone numbers to and from for SMS
message = client.messages.create(to="+14445557777", from_="+12223335555",
                                 body="Test Run Failure Found!")
