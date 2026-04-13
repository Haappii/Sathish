================================================================================
                    FULL LOCAL SETUP & RUN GUIDE
            How to Run and Test Advance Orders Menu Locally
================================================================================

This guide will help you run the ENTIRE application locally and verify that
the Advance Orders menu displays correctly on your machine.

Time estimate: 15 minutes

================================================================================
PREREQUISITES CHECK
================================================================================

Verify you have these installed:
  [ ] Python 3.11+ (check: python --version)
  [ ] Node.js 18+ (check: node --version)
  [ ] npm (check: npm --version)
  [ ] Git (check: git --version)

If any are missing, install them first.

================================================================================
STEP 1: START THE BACKEND SERVICE
================================================================================

1.1 Open terminal and navigate to backend:
    cd path\to\ShopApp\shop-billing-app\backend

1.2 Activate Python virtual environment:

    Windows (PowerShell):
      .\venv\Scripts\Activate.ps1
    
    Windows (Command Prompt):
      venv\Scripts\activate.bat
    
    macOS/Linux:
      source venv/bin/activate

    Expected: Your prompt should show (venv) prefix

1.3 Install Python dependencies:
    pip install -r requirements.txt

    This may take a few minutes on first run.

1.4 Start the backend server:
    python app/main.py

    Or if using Flask:
    flask run

    Or if configured differently:
    python -m app

    Expected output should show:
      * Running on http://127.0.0.1:5000
      * Debug mode: on

    Leave this terminal running.

================================================================================
STEP 2: START THE FRONTEND DEVELOPMENT SERVER
================================================================================

2.1 Open a NEW terminal and navigate to frontend:
    cd path\to\ShopApp\shop-billing-app\frontend

2.2 Ensure dependencies are installed:
    npm install

    (This usually completes quickly if already installed)

2.3 Start the development server:
    npm run dev

    Expected output should show:
      ✓ built in X.XXs
      → Local:   http://localhost:5173/
      → Press q to quit

    Leave this terminal running.

================================================================================
STEP 3: OPEN THE APPLICATION IN BROWSER
================================================================================

3.1 Open your web browser

3.2 Navigate to:
    http://localhost:5173

3.3 The login page should appear

================================================================================
STEP 4: CREATE TEST USER (if needed)
================================================================================

If no test user exists:

4.1 Use an existing test account or create one through the app

4.2 Ensure the user has:
    - Role: Admin, Manager, or Cashier
    - Permission: "billing" module access

For testing purposes, try:
  Username: admin
  Password: (check with your team)

If you don't have credentials, see your backend admin for test accounts.

================================================================================
STEP 5: LOGIN TO THE APPLICATION
================================================================================

5.1 Log in with your test credentials

5.2 You should see the home page dashboard

================================================================================
STEP 6: VERIFY ADVANCE ORDERS MENU DISPLAYS
================================================================================

6.1 Look at the home page dashboard

6.2 You should see menu sections including:

    ┌─────────────────────────────────────────┐
    │ Billing                                 │
    ├─────────────────────────────────────────┤
    │ • Sales Create                          │
    │ • Sales History                         │
    │ • Table Billing                         │
    │ • QR Orders                             │
    │ • Order Live                            │
    │ • KOT                                   │
    │ • Online Orders                         │
    │ • Advance Orders    ← NEW MENU ITEM     │
    │ • Drafts                                │
    │ • Deleted Invoices                      │
    └─────────────────────────────────────────┘

6.3 Check that "Advance Orders" has:
    ☑ Correct position (after Online Orders, before Drafts)
    ☑ Correct icon (clipboard with checkmark)
    ☑ Correct label ("Advance Orders")

If you see all these, the menu is working correctly!

================================================================================
STEP 7: TEST MENU FUNCTIONALITY
================================================================================

7.1 Click on "Advance Orders" menu item

7.2 The page should navigate to /advance-orders

7.3 You should see the Advance Orders management page with:
    ☑ Date filter
    ☑ Status filters (PENDING, CONFIRMED, READY, COMPLETED, CANCELLED)
    ☑ List of advance orders (if any exist)
    ☑ Add/Edit/Delete controls

7.4 Check browser console for errors:
    Press: F12
    Go to: Console tab
    Verify: No red error messages

================================================================================
STEP 8: VERIFY IN DIFFERENT ROLES
================================================================================

Test with different user roles:

For each role below:
  1. Log out
  2. Log in with that role's credentials
  3. Verify "Advance Orders" appears in Billing section
  4. Click to verify it works

Roles to test:
  [ ] Admin - Should have access
  [ ] Manager - Should have access  
  [ ] Cashier - Should have access
  [ ] Other roles - Verify access based on permissions

================================================================================
EXPECTED RESULTS
================================================================================

✓ Backend starts without errors
✓ Frontend builds successfully
✓ Browser loads app at http://localhost:5173
✓ Login works
✓ "Advance Orders" menu visible in Billing section
✓ Menu has clipboard icon
✓ Clicking menu navigates to /advance-orders
✓ Advance Orders page loads
✓ No errors in browser console (F12 → Console)
✓ Works for admin/manager/cashier roles

================================================================================
TROUBLESHOOTING
================================================================================

Issue: Backend won't start
  → Check Python version: python --version
  → Check requirements: pip install -r requirements.txt
  → Check port 5000 isn't in use: netstat -ano | findstr :5000
  → Try different port: Export FLASK_PORT=5001

Issue: Frontend won't start
  → Check Node version: node --version
  → Clear cache: npm clean-install
  → Delete node_modules: rm -r node_modules
  → Reinstall: npm install

Issue: Port already in use
  → Find process: netstat -ano | findstr :PORT
  → Kill process: taskkill /PID PROCESS_ID /F
  → Or use different port: npm run dev -- --port 3000

Issue: Can't login
  → Check backend is running (should see terminal output)
  → Check backend URL in frontend config
  → Check console for errors (F12 → Console tab)

Issue: "Advance Orders" not showing
  → Verify user has "billing" permission
  → Check code was pulled: git pull origin main
  → Verify commit 4cf4fc0 is present: git log | grep "4cf4fc0"
  → Clear browser cache: Ctrl+Shift+Delete
  → Check console errors: F12 → Console tab

Issue: "Advance Orders" shows but clicking does nothing
  → Check backend logs for errors
  → Check browser console: F12 → Console
  → Check network tab: F12 → Network → click menu → look for errors

================================================================================
COMMANDS REFERENCE
================================================================================

Backend Commands:
  cd backend                      # Go to backend folder
  .\venv\Scripts\Activate.ps1     # Activate virtual env (Windows PowerShell)
  source venv/bin/activate        # Activate virtual env (macOS/Linux)
  pip install -r requirements.txt # Install dependencies
  python app/main.py              # Start backend server

Frontend Commands:
  cd frontend                     # Go to frontend folder
  npm install                     # Install dependencies
  npm run dev                     # Start development server
  npm run build                   # Build for production

Git Commands:
  git pull origin main            # Get latest code
  git log --oneline -10           # View last 10 commits
  git show 4cf4fc0                # Show the menu display fix

Browser Developer Tools:
  F12                             # Open developer tools
  Ctrl+Shift+Delete (Windows)     # Clear cache
  Cmd+Shift+Delete (macOS)        # Clear cache

================================================================================
AFTER LOCAL TESTING
================================================================================

Once you've verified the menu displays correctly locally:

1. Production deployment:
   ssh -i key.pem ubuntu@56.228.9.217 'bash ~/Sathish/deploy/QUICK_DEPLOY.sh'

2. Or use GitHub Actions:
   - Push latest code to main
   - Go to GitHub Actions
   - Workflow will auto-deploy

3. Verify on production:
   https://haappiibilling.in

================================================================================
KEEP RUNNING
================================================================================

Keep both terminals running while testing:

Terminal 1 (Backend):
  ✓ Backend server running on port 5000
  ✓ Shows logs and errors
  ✓ Leave running

Terminal 2 (Frontend):
  ✓ Frontend dev server running on port 5173
  ✓ Shows build info and errors
  ✓ Leave running

When done testing, stop both with Ctrl+C in each terminal.

================================================================================
SUCCESS CHECKLIST
================================================================================

After following all steps, verify:

[ ] Backend starts without errors
[ ] Frontend builds without errors
[ ] App accessible at http://localhost:5173
[ ] Can log in successfully
[ ] "Advance Orders" visible in Billing menu
[ ] "Advance Orders" has clipboard icon
[ ] Clicking "Advance Orders" works
[ ] Page navigates to /advance-orders
[ ] Advance Orders interface displays
[ ] No errors in browser console (F12)
[ ] Menu works for multiple roles
[ ] All functionality appears correct

If ALL checked, your local testing is complete and working!

================================================================================
NEXT STEPS
================================================================================

1. If local test PASSED:
   → Code is working correctly
   → Ready to deploy to production
   → Run deployment script

2. If local test FAILED:
   → Review error messages
   → Check troubleshooting section
   → Verify git commits are present
   → Check both services are fully running

3. Questions?
   → See DEPLOYMENT_COMPLETE_GUIDE.md
   → See DEPLOYMENT_READINESS_REPORT.md
   → Check GitHub repo: https://github.com/Haappii/Sathish

================================================================================
GETTING HELP
================================================================================

Check these files for more information:
  • DEPLOYMENT_COMPLETE_GUIDE.md
  • DEPLOYMENT_READINESS_REPORT.md
  • LOCAL_TESTING_INSTRUCTIONS.md
  • DEPLOYMENT_INSTRUCTIONS.md

View recent changes:
  git log --oneline -20

View specific fix:
  git show 4cf4fc0

Check status:
  git status
  git log --oneline -5

================================================================================
YOU ARE NOW READY TO:
  ✓ Test locally
  ✓ Verify the menu works
  ✓ Deploy to production
  ✓ See live changes

Good luck! 🚀
================================================================================
