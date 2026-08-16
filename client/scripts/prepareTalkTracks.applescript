on run argv
    if (count of argv) is less than 3 then error "Missing TALK track-layout arguments."
    set videoTracksToAdd to item 1 of argv as integer
    set audioTracksToAdd to item 2 of argv as integer
    set audioAfterTrack to item 3 of argv as integer

    if videoTracksToAdd is 0 and audioTracksToAdd is 0 then return "ready"

    set currentStep to "start Premiere accessibility automation"
    tell application "System Events"
        set premiereProcesses to every application process whose name starts with ¬
            "Adobe Premiere Pro"
        if (count of premiereProcesses) is 0 then error "Adobe Premiere Pro is not running."
        set premiereProcess to item 1 of premiereProcesses

        tell premiereProcess
            set frontmost to true
            try
                -- Premiere's standard Shift+3 shortcut focuses the active
                -- Timeline without traversing its version-dependent Window menu.
                set currentStep to "focus the TALK Timeline"
                keystroke "3" using shift down
                delay 0.25

                set currentStep to "open Sequence > Add Tracks"
                set sequenceMenu to menu "Sequence" of ¬
                    menu bar item "Sequence" of menu bar 1
                if exists menu item "Add Tracks..." of sequenceMenu then
                    click menu item "Add Tracks..." of sequenceMenu
                else if exists menu item "Add Tracks…" of sequenceMenu then
                    click menu item "Add Tracks…" of sequenceMenu
                else
                    error "Sequence > Add Tracks is unavailable."
                end if
                repeat with attempt from 1 to 100
                    if exists UI element "Add Tracks" then exit repeat
                    delay 0.1
                end repeat
                if not (exists UI element "Add Tracks") then ¬
                    error "Timed out waiting for Premiere's Add Tracks dialog."

                tell UI element "Add Tracks"
                    set currentStep to "set the video-track count"
                    set videoAmountField to text field 1
                    set focused of videoAmountField to true
                    keystroke "a" using command down
                    keystroke (videoTracksToAdd as text)
                    if videoTracksToAdd > 0 then
                        set currentStep to "set video placement after Video 1"
                        set videoPlacementBox to combo box 1
                        perform action "AXPress" of videoPlacementBox
                        delay 0.1
                        keystroke "After Video 1"
                        key code 36
                    end if

                    set currentStep to "set the audio-track count"
                    set audioAmountField to text field 2
                    set focused of audioAmountField to true
                    keystroke "a" using command down
                    keystroke (audioTracksToAdd as text)
                    if audioTracksToAdd > 0 then
                        set currentStep to "set audio placement after Audio " & audioAfterTrack
                        set audioPlacementBox to combo box 2
                        perform action "AXPress" of audioPlacementBox
                        delay 0.1
                        -- Add one staging track below every synchronized source.
                        -- The host moves the sync MP3 there before rebuilding A1-A4.
                        keystroke ("After Audio " & audioAfterTrack)
                        key code 36
                    end if

                    if (value of videoAmountField as integer) is not videoTracksToAdd then ¬
                        error "Premiere did not accept the video-track amount."
                    if (value of audioAmountField as integer) is not audioTracksToAdd then ¬
                        error "Premiere did not accept the audio-track amount."

                end tell
                -- AXPress can report an accessibility error because Premiere
                -- destroys the dialog immediately after accepting it. Treat a
                -- disappeared dialog as success; only propagate the error if
                -- the dialog is still open.
                try
                    set currentStep to "confirm Add Tracks"
                    tell UI element "Add Tracks" to perform action "AXPress" of ¬
                        (first button whose description is "OK")
                on error pressMessage number pressNumber
                    delay 0.25
                    if exists UI element "Add Tracks" then ¬
                        error pressMessage number pressNumber
                end try
                delay 0.2
            on error errorMessage number errorNumber
                try
                    if exists UI element "Add Tracks" then
                        tell UI element "Add Tracks" to perform action "AXPress" of ¬
                            (first button whose description is "Cancel")
                    end if
                end try
                if errorMessage is "" then set errorMessage to ¬
                    "Premiere returned accessibility error " & errorNumber
                error "Failed to " & currentStep & ": " & errorMessage number errorNumber
            end try
        end tell
    end tell

    return "ready"
end run
