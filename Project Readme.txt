========================================================================
                               imgbb.js
========================================================================

A simple, zero-dependency, single-file upload solution for ImgBB. 
Provides a lightweight server endpoint and a drop-in custom web component 
`<imgbb-upload>` for seamless image uploads.

------------------------------------------------------------------------
TABLE OF CONTENTS
------------------------------------------------------------------------
1. Features
2. Installation & Setup
3. Usage
4. Testing & Disclaimer
5. License

------------------------------------------------------------------------
1. FEATURES
------------------------------------------------------------------------
- Single-file solution (`imgbb.js`).
- Integrated front-end custom element (`<imgbb-upload>`).
- Easy environment variable configuration (`IMGBB_API_KEY`).
- Minimal boilerplate required.

------------------------------------------------------------------------
2. INSTALLATION & SETUP
------------------------------------------------------------------------
1. Copy `imgbb.js` into your project directory.
2. Set your ImgBB API key in your environment variables:

   export IMGBB_API_KEY="your_imgbb_api_key_here"

3. Mount the handler at `/api/upload` within your application or server 
   routing system.

------------------------------------------------------------------------
3. USAGE
------------------------------------------------------------------------
To use the upload widget on your web page, include the `<imgbb-upload>` 
custom element and load the widget script endpoint.

Add the following HTML snippet to your page:

    <imgbb-upload></imgbb-upload>
    <script src="/api/upload?widget"></script>

------------------------------------------------------------------------
4. TESTING & DISCLAIMER
------------------------------------------------------------------------
PLEASE NOTE:
This project has currently been tested ONLY against a mocked ImgBB API endpoint 
and has NOT yet been fully tested against the live, production ImgBB API. 

Use in production environments at your own risk, or test thoroughly with 
a live API key prior to deployment.

------------------------------------------------------------------------
5. LICENSE
------------------------------------------------------------------------
Open Source - Feel free to modify and distribute according to your project's 
licensing terms.