app ui_root {
  content_state {
    let authenticated_provider = 'none';
    let chat_transcript = [];
  }

  /** Keep the selected provider's API key and chat history in memory. Generate replies with a GPT Terra model through OpenAI or OpenRouter, depending on the selected provider. */
  backend chat_manager {

    /** Save the OpenAI API key and select OpenAI as the provider. */
    auth_open_ai(api_key: string): void;

    /** Save the OpenRouter API key and select OpenRouter as the provider. */
    auth_open_router(api_key: string): void;

    /** Remove the saved API key and set the provider to none. */
    sign_out(): void;

    /** Return the selected provider. */
    get_provider(): 'none' | 'open_ai' | 'open_router';

    /** Add the user message to the stored chat history and return a model reply using the selected provider. */
    send_message(content: string): { role: 'user' | 'assistant'; content: string };

    /** Clear the stored chat history. */
    reset_chat(): void;
  }

  page provider_selection {
    button select_open_router {
      on_click {
        navigate('open_router_sign_in');
      }
    }

    button select_open_ai {
      on_click {
        navigate('open_ai_sign_in');
      }
    }
  }

  page open_router_sign_in {
    button back_to_providers {
      on_click {
        navigate('provider_selection');
      }
    }

    text_field api_key;

    button save_key {
      on_click {
        chat_manager.auth_open_router(api_key);
        authenticated_provider = 'open_router';
        navigate('chat_page');
      }
    }
  }

  page open_ai_sign_in {
    button back_to_providers {
      on_click {
        navigate('provider_selection');
      }
    }

    text_field api_key;

    button save_key {
      on_click {
        chat_manager.auth_open_ai(api_key);
        authenticated_provider = 'open_ai';
        navigate('chat_page');
      }
    }
  }

  page chat_page {
    container settings {
      link help {
        url "https://www.openworkbookai.org/help";
      }

      text signed_in_provider {
        content authenticated_provider;
      }

      button sign_out {
        on_click {
          chat_manager.sign_out();
          authenticated_provider = 'none';
          navigate('provider_selection');
        }
      }
    }

    button clear_chat {
      on_click {
        chat_manager.reset_chat();
        chat_transcript = [];
      }
    }

    /** Display the conversation in order, distinguish user and assistant messages, and keep new messages in view. */
    custom transcript {
      reads chat_transcript;
    }

    text_area message;

    button send {
      on_click {
        chat_transcript = [...chat_transcript, { role: 'user', content: message }];
        const reply = chat_manager.send_message(message);
        chat_transcript = [...chat_transcript, reply];
      }
    }
  }
}
