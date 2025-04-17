// ==UserScript==
// @name         GTAGuessr Versus Helper (Manual Click)
// @namespace    http://tampermonkey.net/
// @version      1.1-manual
// @description  Finds correct location in Versus mode, centers map, requires manual click & submit. Based on public code.
// @author       Pyrite (Modified)
// @match        *://*.gtaguessr.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let gameLocations = [];
    let isBusy = false;

    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Checks if it looks like Normal Mode based on UI elements (used for initial check)
    function isInNormalMode() {
      var infoDiv = document.querySelector("div.info"); // Check for the main info panel
      if (infoDiv) {
        // Versus mode has a different structure inside div.info than normal mode usually
        var totalDiv = infoDiv.querySelector("div.total"); // Normal mode often has this for score total
        return !!totalDiv; // If totalDiv exists, assume Normal Mode
      }
      return false; // If infoDiv doesn't exist, unlikely to be in a standard game mode view
    }

    // This function simulates a click, but we will NOT be calling it automatically anymore.
    // It remains here in case needed for other purposes or future changes.
    function clickMapCenter() {
      try {
          const panelElement = document.querySelector('[data-control="Panel"]');
          if (!panelElement) { console.error("Panel element not found for click calc."); return; }
          const panelRect = panelElement.getBoundingClientRect();
          const screenWidth = window.innerWidth;
          const remainingWidth = screenWidth - panelRect.width;
          const x = panelRect.width + remainingWidth / 2;
          const y = window.innerHeight / 2 - 15; // Small offset up from true center

          const targetElement = document.elementFromPoint(x, y);
          if (!targetElement) { console.error("Target element for click not found at calculated center."); return; }

          const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x, // Use calculated coords relative to viewport
            clientY: y,
            // Many other properties can often be omitted for synthetic events
            button: 0, // Primary button
            buttons: 1, // Primary button down
          });
          targetElement.dispatchEvent(clickEvent);
          console.log("Simulated click at map center (X:", x, "Y:", y, ") on element:", targetElement);
      } catch (e) {
          console.error("Error during clickMapCenter:", e);
      }
    }

    // Fetches the location IDs for the current versus match
    async function getVersusLocations() {
      if (isBusy) {
        console.log("Busy getting locations, skipping.");
        return;
      }
      isBusy = true;
      changeCopyrightText("Getting location list...");

      const lobbyID = localStorage.getItem("lobbyId");
      const lobbyUserID = localStorage.getItem("lobbyUserId");

      if (!lobbyID || !lobbyUserID) {
          alert("Error: Lobby ID or User ID not found in localStorage. Are you in a Versus match?");
          changeCopyrightText("Error: Lobby details not found.");
          isBusy = false;
          return;
      }

      try {
          let response = await fetch("https://gtaguessr.com/API/GetVersusLocations", {
            method: "POST",
            body: JSON.stringify({
              lobbyId: lobbyID,
              lobyUserId: lobbyUserID, // Note: Original script had typo 'lobyUserId', keeping it in case API expects it
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          response = await response.json();
          gameLocations = response?.locations ?? [];
          if (gameLocations.length === 0) {
               console.warn("Received empty locations array from API.");
               changeCopyrightText("No locations found for this lobby.");
          } else {
               console.log("Fetched game locations:", gameLocations);
               changeCopyrightText("Locations fetched. Select round.");
          }
      } catch(error) {
           alert("Error fetching locations from API. Check console (F12).");
           console.error("getVersusLocations error:", error);
           changeCopyrightText("Error fetching locations.");
      } finally {
          isBusy = false;
      }
    }

    // Uses the SubmitAGuess API endpoint exploit to get coordinates for a specific location ID
    async function getLocationByID(id) {
      if (!gameLocations || id >= gameLocations.length || !gameLocations[id]?.locationId) {
          console.error("Invalid location ID index or gameLocations not populated:", id);
          throw new Error("Invalid location ID requested.");
      }

      const locationData = gameLocations[id];
      const locationId = locationData.locationId;
      console.log(`Requesting coordinates for round ${id + 1} (Location ID: ${locationId})`);

      // These seem less critical for the exploit to work, but we populate them anyway
      const randomSessionId = getRandomInt(10000000, 99999999).toString();
      const randomLobbyId = getRandomInt(10000000, 99999999).toString();
      const randomUserId = getRandomInt(555555, 999999).toString();

      try {
          let response = await fetch("https://gtaguessr.com/API/SubmitAGuess", {
            method: "POST",
            body: JSON.stringify({
              sessionId: randomSessionId,
              locationId: locationId,
              lat: `${getRandomInt(-7000, 7000)}.${getRandomInt(0, 99999)}`, // Junk Lat
              lng: `${getRandomInt(-7000, 7000)}.${getRandomInt(0, 99999)}`, // Junk Lng (Corrected range from original script)
              lobyId: randomLobbyId, // Original script used random ID here
              lobyUserId: randomUserId, // Original script used random ID here
              game: getRandomInt(1, 5).toString(), // Seems arbitrary
            }),
            headers: {
              "Content-Type": "application/json",
            },
          });

           if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          response = await response.json();
          // Extract the *correct* coordinates leaked by the API response
          const lat = response?.lat ?? 0;
          const lng = response?.lng ?? 0;

          if (lat === 0 && lng === 0 && !response?.lat && !response?.lng) {
              console.warn("API response did not contain lat/lng.", response);
              throw new Error("Coordinates not found in API response.");
          }

          console.log(`Coordinates received for round ${id + 1}:`, { lat, lng });
          return { lat, lng };

      } catch (error) {
          console.error("getLocationByID error:", error);
          throw error; // Re-throw to be caught by setLocation
      }
    }

    // Finds the coordinates for the selected round, updates URL hash to center map.
    // DOES NOT automatically place the marker anymore.
    async function setLocation(locationID) {
      if (isBusy) {
        console.log("Busy setting location, skipping.");
        return;
      }
      isBusy = true;

      changeCopyrightText("Finding coordinates...");
      let exactLocation;

      const mapElement = document.querySelector('[data-control="Map"]');
      if (!mapElement) { console.error("Map element not found."); isBusy = false; return; }

      // Visual feedback
      mapElement.style.transition = "filter 200ms";
      mapElement.style.filter = "grayscale(1) brightness(20%)";
      document.body.style.cursor = "progress";

      try {
        exactLocation = await getLocationByID(locationID);
      } catch(error) {
        alert("Error while finding exact location. Check console (F12).");
        mapElement.style.filter = "grayscale(0) brightness(100%)";
        document.body.style.cursor = "inherit";
        changeCopyrightText("Error finding location.");
        isBusy = false;
        return;
      }

      // The magic: Update URL hash to force map repositioning
      // The #5 likely signifies a state or round number the map code listens for
      window.location.hash = `5/${exactLocation.lat}/${exactLocation.lng}`;
      console.log(`Updated window.location.hash to: #5/${exactLocation.lat}/${exactLocation.lng}`);

      changeCopyrightText("Map centered! Place marker manually.");

      // Wait for the map to likely finish panning due to hash change
      await new Promise((resolve) => {
        setTimeout(resolve, 1500); // Reduced wait slightly, might need adjustment
      });

      // *** REMOVED AUTOMATIC CLICK ***
      // clickMapCenter(); // WE NO LONGER CALL THIS

      // Restore visuals
      mapElement.style.filter = "grayscale(0) brightness(100%)";
      document.body.style.cursor = "inherit";
      isBusy = false;

      // Final feedback - reminding user to click
      changeCopyrightText(
        `Round ${locationID + 1} centered. Click map & submit!`,
      );
    }

    // --- UI Functions ---

    function changeCopyrightText(text) {
      try {
          const element = document.getElementById("copyright");
          if (element) {
              element.innerText = "© GtaGuessr | " + text;
          } else {
              console.warn("Copyright element not found to update text.");
          }
      } catch (e) {
           console.error("Error changing copyright text:", e);
      }
    }

    // Creates the round selection buttons after fetching locations
    async function getLocationsAndInitUI() {
        // Remove previous buttons if they exist
      const existingButtons = document.getElementById("cheatLocations");
      if (existingButtons) {
        existingButtons.remove();
        changeCopyrightText("Reloading Locations...");
      } else {
        changeCopyrightText("Finding Locations...");
      }

      // Hide the initial "Find Locations" button
      const findButton = document.getElementById("cheatFindLocations");
      if (findButton) findButton.style.display = 'none';


      try {
        await getVersusLocations(); // Fetch the location IDs first
      } catch (e) {
         // Error handled within getVersusLocations, but ensure button is re-shown if fetch failed
          if (findButton) findButton.style.display = 'block';
        return; // Stop if locations couldn't be fetched
      }

        // Only proceed if locations were actually found
      if (gameLocations.length === 0) {
          if (findButton) findButton.style.display = 'block'; // Show button again if no locations
          alert("Could not find any locations for this Versus lobby.");
          return;
      }


      const targetElement = document.querySelector('[data-control="Panel"]');
      if (!targetElement) {
           alert("Error: Could not find side panel element to insert buttons.");
           if (findButton) findButton.style.display = 'block';
           return;
      }

      const newElement = document.createElement("div");
      newElement.id = "cheatLocations";
      newElement.style.display = "grid";
      newElement.style.gridTemplateColumns = `repeat(${gameLocations.length}, 1fr)`; // Adjust grid to actual number of rounds found
      newElement.style.columnGap = "5px";
      newElement.style.marginBottom = "5px";

      // Create buttons for each round found
      gameLocations.forEach((location, index) => {
        const buttonElement = document.createElement("button");
        buttonElement.id = `cheatSetLocation${index}`;
        buttonElement.style.backgroundColor = "#f83849";
        buttonElement.style.border = "none";
        buttonElement.style.padding = "10px 0"; // Adjusted padding
        buttonElement.style.width = "100%";
        buttonElement.style.fontWeight = "500";
        buttonElement.style.color = "white";
        buttonElement.style.fontSize = '14px';
        buttonElement.style.cursor = 'pointer';
        // Use an event listener instead of new Function for better practice & scope handling
        buttonElement.addEventListener('click', () => setLocation(index));
        buttonElement.textContent = `${index + 1}`; // Button text is the round number (1-based)
        newElement.appendChild(buttonElement);
      });

      // Insert the row of buttons at the top of the panel
      targetElement.insertBefore(newElement, targetElement.firstChild);
    }

    // Initial setup and activation button creation
    async function activateCheats() {
      console.log("Activating Versus Helper...");
      // Basic environment checks
      if (window.location.host !== "gtaguessr.com") {
        alert("Unsupported website! Cheats only work on gtaguessr.com (Versus Mode)!");
        return;
      }

      if (!document.querySelector('[data-control="Map"]')) {
        alert("Cheats can only be initiated while in game (Versus Mode)!");
        return;
      }

      if (isInNormalMode()) {
        alert("Normal Mode is not supported! Only Versus Mode is!");
        return;
      }

      // Prevent multiple activations
       if (document.body.getAttribute("cheats-init") === "yes") {
        alert("Cheats already activated!");
        return;
      } else {
        document.body.setAttribute("cheats-init", "yes");
      }


      // Create the initial button to fetch locations
      const findLocationsCheatElement = document.createElement("button");
      findLocationsCheatElement.id = "cheatFindLocations"; // Give it an ID for easier removal/hiding later
      findLocationsCheatElement.style.border = "none";
      findLocationsCheatElement.style.backgroundColor = "#f83849";
      findLocationsCheatElement.style.padding = "10px 20px"; // Adjusted padding
      findLocationsCheatElement.style.fontWeight = "500";
      findLocationsCheatElement.style.color = "white";
      findLocationsCheatElement.style.zIndex = "99999"; // Lowered z-index slightly
      findLocationsCheatElement.style.bottom = "20px"; // Position lower
      findLocationsCheatElement.style.position = "fixed"; // Use fixed positioning
      findLocationsCheatElement.style.right = "20px";
      findLocationsCheatElement.style.cursor = 'pointer';
      findLocationsCheatElement.style.borderRadius = '5px';
      // Use event listener
      findLocationsCheatElement.addEventListener('click', getLocationsAndInitUI);
      findLocationsCheatElement.textContent = "Find Locations";

      document.body.appendChild(findLocationsCheatElement); // Append to body

      changeCopyrightText("Versus Cheats Activated");
      console.log("Activation complete. Click 'Find Locations'.");
    }

    // --- Start Execution ---
    // Use a slight delay or wait for document ready to ensure page elements exist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activateCheats);
    } else {
        activateCheats(); // Already loaded
    }

})();
