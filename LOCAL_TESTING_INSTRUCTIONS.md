================================================================================
              LOCAL TESTING INSTRUCTIONS - Advance Orders Menu
================================================================================

To verify the Advance Orders menu displays correctly, follow these steps to run
the app locally and test the menu in your development environment.

================================================================================
STEP 1: PREPARE ENVIRONMENT
================================================================================

Open terminal/PowerShell and navigate to the frontend folder:
```
cd path\to\ShopApp\shop-billing-app\frontend
```

Ensure Node.js dependencies are installed:
```
npm install
```

================================================================================
STEP 2: START DEVELOPMENT SERVER
================================================================================

Start the Vite development server:
```
npm run dev
```

Output should show:
  ✓ built in X.XXs
  → Local:   http://localhost:5173/

================================================================================
STEP 3: OPEN LOCAL APPLICATION
================================================================================

Open your browser and navigate to:
  http://localhost:5173

The application will load in development mode with hot-reload enabled.

================================================================================
STEP 4: LOGIN WITH TEST USER
================================================================================

Log in with credentials that have access to the "billing" module:
  - Admin user (has access to all features)
  - Manager user (has access to billing features)
  - Cashier user (has access to billing features)

Note: The app may prompt for backend connection. Ensure:
  - Backend service is running
  - Backend is accessible from your development machine

If backend is unavailable, the menu might not load. See BACKEND SETUP below.

================================================================================
STEP 5: VERIFY MENU DISPLAYS
================================================================================

Once logged in, you should see the home page dashboard with menu groups:

Look for: "Billing" section on the home page
Within that section, you should see:

  ✓ Sales
  ✓ Online Orders
  ✓ Advance Orders    ← THIS IS THE NEW MENU ITEM
  ✓ Draft Bills
  ... more items

The menu item should have:
  - Icon: Clipboard with checkmark (FaClipboardList)
  - Label: "Advance Orders"
  - Path: /advance-orders

================================================================================
STEP 6: TEST MENU FUNCTIONALITY
================================================================================

Click on "Advance Orders" menu item.

Expected behavior:
  - Page navigates to /advance-orders
  - AdvanceOrders component loads
  - Advance order management interface displays
  - No errors in browser console (F12)

The page should show:
  - Date filter options
  - Status filter (PENDING, CONFIRMED, READY, COMPLETED, CANCELLED)
  - List of advance orders (if any exist in database)
  - Add new order button
  - Status management controls

================================================================================
STEP 7: VERIFY IN DIFFERENT ROLES
================================================================================

Test with different user roles to confirm menu displays:

[ ] Admin user → Menu displays ✓
[ ] Manager user → Menu displays ✓
[ ] Cashier user → Menu displays ✓
[ ] Waiter user → Menu displays ✓ (if applicable)

Menu should display for any role with "billing" permission.

================================================================================
BACKEND SETUP (If needed)
================================================================================

If the app shows connection errors or menu doesn't load:

1. Start the backend service:
   ```
   cd path\to\ShopApp\shop-billing-app\backend
   python -m pytest --lf  # If using pytest
   # OR
   python app/main.py  # If running directly
   ```

2. Verify backend is accessible:
   ```
   curl http://localhost:5000/health  # Adjust port as needed
   ```

3. Check that frontend API endpoint is configured correctly in:
   ```
   shop-billing-app/frontend/src/api/authAxios.js
   ```

================================================================================
EXPECTED CODE CHANGES (For Reference)
================================================================================

The following changes were made to enable this menu:

1. File: frontend/src/utils/navigationMenu.jsx
   - Added "Advance Orders" to cashier role menu (line 403)
   - Added "Advance Orders" to manager role menu (line 452)
   - Added "Advance Orders" to admin role menu (line 505)
   - Icon: FaClipboardList
   - Path: /advance-orders
   - Permission: "billing" module

2. File: frontend/src/pages/Home.jsx
   - Added /advance-orders to MENU_GROUPS[0].paths array (line 66)
   - This enables the menu to display on the home page dashboard
   - Placed in "billing" group alongside other billing features

3. File: frontend/src/App.jsx
   - Route /advance-orders already exists (route registered)
   - Component: AdvanceOrders.jsx
   - No changes needed

================================================================================
TROUBLESHOOTING
================================================================================

If the menu doesn't appear:

❌ Menu not displaying in any section
   → Check browser console for errors (F12 → Console tab)
   → Verify user has "billing" permission
   → Check that latest code is pulled: git pull origin main

❌ "Advance Orders" appears but is grayed out / disabled
   → User doesn't have "billing" permission
   → Log in with admin/manager/cashier role

❌ Clicking menu causes error
   → Backend service may be down
   → Check AdvanceOrders.jsx component exists
   → Verify route is registered in App.jsx

❌ "Advance Orders" not in visible menu items list
   → Check MENU_GROUPS array in Home.jsx line 66
   → Verify /advance-orders is in billing paths array
   → Clear browser cache and reload (Ctrl+Shift+Delete)

❌ Still having issues
   → Check git log to confirm latest commits are pulled
   → Run: npm run build (to check for build errors)
   → Check browser console errors in detail
   → Restart dev server: npm run dev

================================================================================
VERIFICATION CHECKLIST
================================================================================

Local testing checklist:

[ ] Dev server started successfully (npm run dev)
[ ] App accessible at http://localhost:5173
[ ] User logged in with billing permissions
[ ] Home page dashboard loads
[ ] "Billing" menu group is visible
[ ] "Advance Orders" item appears in Billing group
[ ] "Advance Orders" has clipboard icon
[ ] Click on "Advance Orders" works without errors
[ ] Page navigates to /advance-orders
[ ] AdvanceOrders component displays
[ ] No console errors (F12 → Console)
[ ] Menu works in admin role
[ ] Menu works in manager role
[ ] Menu works in cashier role

================================================================================
GIT COMMITS CONTAINING CHANGES
================================================================================

These commits contain the menu implementation:

Commit 6b15cd7: "Add Advance Orders menu to home page for all roles + rebuild apps"
  - Added menu to role definitions

Commit 4cf4fc0: "Fix: Add Advance Orders to home page menu groups"
  - Added menu display filter (CRITICAL FIX)

To view changes:
  git show 6b15cd7
  git show 4cf4fc0

================================================================================
NEXT STEPS
================================================================================

1. Follow steps 1-7 above to verify menu displays locally
2. Test menu functionality in your local environment
3. Once verified, the code is ready for production deployment
4. Production deployment command:
   ssh -i key.pem ubuntu@56.228.9.197 'bash ~/Sathish/deploy/QUICK_DEPLOY.sh'

================================================================================
Questions?
================================================================================

- All code is committed to GitHub: https://github.com/Haappii/Sathish
- Latest commit: Check git log --oneline -5
- Full documentation: See DEPLOYMENT_READINESS_REPORT.md

